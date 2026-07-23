import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';

// 유튜브 자막(timedtext/InnerTube) 엔드포인트는 CORS를 허용하지 않아 브라우저에서 직접 호출하면
// 막힌다. 이 함수만 예외적으로 서버(Vercel Serverless Function)에서 실행해 CORS 문제를 우회한다.
// 한국어 자막을 우선 시도하고, 없으면 영어, 그래도 없으면 기본(자동생성 포함) 트랙 순으로 시도한다.
const LANG_PRIORITY = ['ko', 'en'];

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
    for (const lang of LANG_PRIORITY) {
      try {
        const items = await YoutubeTranscript.fetchTranscript(url, { lang });
        res.status(200).json({ transcript: items.map((item) => item.text).join(' '), language: lang });
        return;
      } catch (err) {
        if (err instanceof YoutubeTranscriptNotAvailableLanguageError) continue;
        throw err;
      }
    }
    // ko/en 자막 트랙이 없으면 기본(자동생성 등) 트랙으로 마지막 한 번 더 시도
    const items = await YoutubeTranscript.fetchTranscript(url);
    res.status(200).json({
      transcript: items.map((item) => item.text).join(' '),
      language: items[0]?.lang ?? '자동생성',
    });
  } catch (err) {
    if (err instanceof YoutubeTranscriptDisabledError || err instanceof YoutubeTranscriptNotAvailableError) {
      res
        .status(404)
        .json({ error: 'no_captions', message: '이 영상은 자막이 없어 레시피 추출이 어려워요.' });
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
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '자막을 가져오는 중 알 수 없는 오류가 발생했습니다.',
    });
  }
}
