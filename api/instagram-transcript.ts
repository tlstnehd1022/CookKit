import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { fetchSupadataTranscript, fetchSupadataMetadata, SupadataNotAccessibleError } from './_lib/supadata.js';
import { extractInstagramPostId } from '../src/lib/instagramTranscript.js';

// Supadata 폴백이 긴 릴스는 작업(job) 방식으로 처리하고 폴링이 필요할 수 있어 기본 실행시간보다 늘려둔다.
export const config = { maxDuration: 120 };

interface InstagramResult {
  transcript: string;
  caption: string;
  language: string;
  thumbnailUrl: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!url) {
    res.status(400).json({ error: 'invalid_url', message: '인스타그램 링크가 필요합니다.' });
    return;
  }
  if (!extractInstagramPostId(url)) {
    res.status(400).json({ error: 'invalid_url', message: '인스타그램 링크를 알아볼 수 없어요.' });
    return;
  }

  // 유튜브와 달리 인스타그램은 무료로 쓸 수 있는 자체 자막 라이브러리가 없어 항상 Supadata를
  // 거친다 — 키가 없으면 애초에 이 기능 자체를 켤 수 없다.
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    res.status(501).json({ error: 'not_configured', message: '인스타그램 변환 기능이 아직 설정되지 않았어요.' });
    return;
  }

  try {
    await requireUser(req);

    // metadata를 먼저 확인해서(1) 비공개/삭제 게시물을 빠르게 걸러내고(2) 캡션·썸네일도
    // 같이 얻는다 — 이후 transcript 요청(job 폴링까지 걸릴 수 있음)을 접근 불가한 게시물에도
    // 낭비하지 않기 위함.
    const meta = await fetchSupadataMetadata(url, apiKey);
    const transcript = await fetchSupadataTranscript(url, apiKey);
    const caption = meta?.caption.trim() ?? '';

    if (!transcript?.transcript.trim() && !caption) {
      res.status(404).json({
        error: 'no_captions',
        message: '이 게시물은 자막도 캡션도 없어 레시피 추출이 어려워요.',
      });
      return;
    }

    const result: InstagramResult = {
      transcript: transcript?.transcript ?? '',
      caption,
      language: transcript?.language ?? 'auto',
      thumbnailUrl: meta?.thumbnailUrl ?? null,
    };
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    if (err instanceof SupadataNotAccessibleError) {
      res.status(404).json({
        error: 'video_unavailable',
        message: '게시물을 찾을 수 없어요. 비공개 계정이거나 삭제된 게시물일 수 있어요.',
      });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '인스타그램 정보를 가져오는 중 알 수 없는 오류가 발생했습니다.',
    });
  }
}
