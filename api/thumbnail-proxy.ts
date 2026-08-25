import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { fetchSupadataMetadata, SupadataNotAccessibleError } from './_lib/supadata.js';

// 유튜브(원래 youtube-thumbnail.ts)/인스타그램 썸네일을 한 함수로 합쳤다 — Vercel Hobby
// 플랜의 서버리스 함수 12개 제한 때문에(ai-extract-youtube.ts와 같은 이유) 새 함수를 늘리는
// 대신 이 프록시를 플랫폼 공용으로 확장했다. 둘 다 브라우저가 직접 fetch로 바이트를 읽을 수
// 없어서(CORS) 서버를 거친다 — <img> 태그로 "보여주기"는 되지만 Supabase Storage에 업로드
// 하려면 fetch로 실제 바이트가 필요.
//
// YouTube: 쿼리 ?videoId= — 영상 ID는 안 바뀌므로 URL이 항상 유효하다.
// Instagram: 쿼리 ?instagramUrl= — CDN 썸네일 URL은 서명이 있어 시간이 지나면 만료될 수 있어서,
// 변환 시점에 받은 URL을 그대로 들고 있지 않고 저장 시점에 항상 metadata를 다시 조회해 신선한
// URL을 받는다.

// maxresdefault가 없는 영상은 YouTube가 120x90짜리 더미 이미지를 200 OK로 내려주므로, 그 더미
// 이미지는 항상 몇 KB 이내로 작다는 특징으로 감지해서 hqdefault(모든 영상에 항상 존재)로 폴백한다.
const MAXRES_PLACEHOLDER_MAX_BYTES = 4000;

async function proxyImage(res: VercelResponse, imageUrl: string): Promise<boolean> {
  const response = await fetch(imageUrl);
  if (!response.ok) return false;
  const arrayBuffer = await response.arrayBuffer();
  res.setHeader('Content-Type', response.headers.get('content-type') ?? 'image/jpeg');
  res.status(200).send(Buffer.from(arrayBuffer));
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const videoId = typeof req.query.videoId === 'string' ? req.query.videoId.trim() : '';
  const instagramUrl = typeof req.query.instagramUrl === 'string' ? req.query.instagramUrl.trim() : '';
  if (!videoId && !instagramUrl) {
    res.status(400).json({ error: 'invalid_request', message: 'videoId 또는 instagramUrl이 필요합니다.' });
    return;
  }

  try {
    await requireUser(req);

    if (videoId) {
      const maxresUrl = `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/maxresdefault.jpg`;
      const hqUrl = `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;

      let response = await fetch(maxresUrl);
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (!response.ok || contentLength < MAXRES_PLACEHOLDER_MAX_BYTES) {
        response = await fetch(hqUrl);
      }
      if (!response.ok) {
        res.status(404).json({ error: 'thumbnail_not_found', message: '썸네일을 찾을 수 없어요.' });
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      res.setHeader('Content-Type', response.headers.get('content-type') ?? 'image/jpeg');
      res.status(200).send(Buffer.from(arrayBuffer));
      return;
    }

    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
      res.status(501).json({ error: 'not_configured', message: '인스타그램 변환 기능이 아직 설정되지 않았어요.' });
      return;
    }
    const meta = await fetchSupadataMetadata(instagramUrl, apiKey);
    if (!meta?.thumbnailUrl || !(await proxyImage(res, meta.thumbnailUrl))) {
      res.status(404).json({ error: 'thumbnail_not_found', message: '썸네일을 찾을 수 없어요.' });
      return;
    }
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    if (err instanceof SupadataNotAccessibleError) {
      res.status(404).json({ error: 'video_unavailable', message: '게시물을 찾을 수 없어요.' });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '썸네일을 가져오는 중 오류가 발생했습니다.',
    });
  }
}
