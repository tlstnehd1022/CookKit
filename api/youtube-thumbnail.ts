import type { VercelRequest, VercelResponse } from '@vercel/node';

// YouTube 썸네일(img.youtube.com)은 CORS를 허용하지 않아 브라우저에서 fetch로 바이트를 읽어올
// 수 없다(<img> 태그로 화면에 "보여주기"는 되지만, Supabase Storage에 업로드하려면 fetch로 실제
// 바이트가 필요한데 그건 CORS에 막힘 — 자막 API와 같은 이유로 이 요청만 서버를 거친다).
// maxresdefault가 없는 영상은 YouTube가 120x90짜리 더미 이미지를 200 OK로 내려주므로, 그 더미
// 이미지는 항상 몇 KB 이내로 작다는 특징으로 감지해서 hqdefault(모든 영상에 항상 존재)로 폴백한다.
const MAXRES_PLACEHOLDER_MAX_BYTES = 4000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const videoId = typeof req.query.videoId === 'string' ? req.query.videoId.trim() : '';
  if (!videoId) {
    res.status(400).json({ error: 'invalid_video_id', message: '유튜브 영상 ID가 필요합니다.' });
    return;
  }

  try {
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
  } catch (err) {
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '썸네일을 가져오는 중 오류가 발생했습니다.',
    });
  }
}
