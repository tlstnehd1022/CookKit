import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';
import { requireUser, AuthError } from './_lib/auth.js';

// Supadata 폴백이 긴 영상은 작업(job) 방식으로 처리하고 폴링이 필요할 수 있어 기본 실행시간보다 늘려둔다.
// Vercel Hobby 플랜에서 60초를 넘기려면 프로젝트에서 Fluid Compute가 켜져 있어야 한다.
export const config = { maxDuration: 120 };

// 유튜브 자막(timedtext/InnerTube) 엔드포인트는 CORS를 허용하지 않아 브라우저에서 직접 호출하면
// 막힌다. 이 함수만 예외적으로 서버(Vercel Serverless Function)에서 실행해 CORS 문제를 우회한다.
// 한국어 자막을 우선 시도하고, 없으면 영어, 그래도 없으면 기본(자동생성 포함) 트랙 순으로 시도한다.
const LANG_PRIORITY = ['ko', 'en'];

// 자막이 아예 없는 영상은 youtube-transcript로 근본적으로 처리 불가(가져올 자막 트랙 자체가 없음).
// 이 경우에만 Supadata(supadata.ai)로 한 번 더 시도한다 — Supadata는 자막이 없으면 자체적으로
// 오디오를 음성인식(Whisper)해서 대신 준다(mode=auto). 우리 서버는 그 결과를 기다렸다가 그대로
// 전달할 뿐, 오디오 다운로드/STT 자체는 하지 않는다(유튜브 봇 차단 리스크를 직접 떠안지 않기 위함).
// SUPADATA_API_KEY가 설정되어 있지 않으면(선택 사항) 이 폴백 없이 기존 에러를 그대로 반환한다.
const SUPADATA_BASE_URL = 'https://api.supadata.ai/v1';
const SUPADATA_POLL_INTERVAL_MS = 3000;
const SUPADATA_MAX_WAIT_MS = 100_000;

interface TranscriptResult {
  transcript: string;
  language: string;
  source: 'captions' | 'supadata';
}

async function fetchOwnCaptions(url: string): Promise<TranscriptResult> {
  for (const lang of LANG_PRIORITY) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(url, { lang });
      return { transcript: items.map((item) => item.text).join(' '), language: lang, source: 'captions' };
    } catch (err) {
      if (err instanceof YoutubeTranscriptNotAvailableLanguageError) continue;
      throw err;
    }
  }
  // ko/en 자막 트랙이 없으면 기본(자동생성 등) 트랙으로 마지막 한 번 더 시도
  const items = await YoutubeTranscript.fetchTranscript(url);
  return {
    transcript: items.map((item) => item.text).join(' '),
    language: items[0]?.lang ?? '자동생성',
    source: 'captions',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSupadataFallback(url: string): Promise<TranscriptResult | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return null;

  const requestUrl = `${SUPADATA_BASE_URL}/transcript?url=${encodeURIComponent(url)}&lang=ko&text=true&mode=auto`;
  const res = await fetch(requestUrl, { headers: { 'x-api-key': apiKey } });

  if (res.status === 200) {
    const data = await res.json();
    if (!data.content) return null;
    return { transcript: data.content as string, language: data.lang ?? 'auto', source: 'supadata' };
  }

  if (res.status === 202) {
    const { jobId } = await res.json();
    const startedAt = Date.now();
    while (Date.now() - startedAt < SUPADATA_MAX_WAIT_MS) {
      await sleep(SUPADATA_POLL_INTERVAL_MS);
      const pollRes = await fetch(`${SUPADATA_BASE_URL}/transcript/${jobId}`, {
        headers: { 'x-api-key': apiKey },
      });
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();
      if (pollData.status === 'completed' && pollData.content) {
        return { transcript: pollData.content as string, language: pollData.lang ?? 'auto', source: 'supadata' };
      }
      if (pollData.status === 'failed') return null;
    }
    return null; // 폴링 시간 초과
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!url) {
    res.status(400).json({ error: 'invalid_url', message: '유튜브 링크가 필요합니다.' });
    return;
  }

  try {
    await requireUser(req);
    const result = await fetchOwnCaptions(url);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      res
        .status(404)
        .json({ error: 'video_unavailable', message: '영상을 찾을 수 없어요. 비공개이거나 삭제된 영상일 수 있어요.' });
      return;
    }
    if (err instanceof YoutubeTranscriptTooManyRequestError) {
      res
        .status(429)
        .json({ error: 'rate_limited', message: '유튜브 요청이 너무 많아 요청이 제한됐어요. 잠시 후 다시 시도해주세요.' });
      return;
    }
    if (err instanceof YoutubeTranscriptDisabledError || err instanceof YoutubeTranscriptNotAvailableError) {
      try {
        const fallback = await fetchSupadataFallback(url);
        if (fallback) {
          res.status(200).json(fallback);
          return;
        }
      } catch {
        // Supadata 호출 자체가 실패해도 아래 기본 에러로 넘어간다
      }
      res.status(404).json({ error: 'no_captions', message: '이 영상은 자막이 없어 레시피 추출이 어려워요.' });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '자막을 가져오는 중 알 수 없는 오류가 발생했습니다.',
    });
  }
}
