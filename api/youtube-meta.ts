import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey } from './_lib/apiKeyStore.js';
import { fetchYoutubeVideoMeta } from '../src/lib/geminiClient.js';

// 유튜브 영상 제목/설명란(YouTube Data API) 조회도 서버 경유로 전환(Vault에 저장된 본인의
// youtube 키를 서버에서만 복호화해서 사용). 이 키는 완전히 선택 사항이라 — 키가 없거나 조회
// 자체가 실패해도(비공개 영상 등) meta: null로 조용히 응답한다(자막 기반 추출은 이것과 무관하게
// 계속 진행됨, RecipeEditor.tsx의 기존 동작과 동일).
export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', message: 'POST만 지원합니다.' });
    return;
  }

  try {
    const user = await requireUser(req);
    const { url } = (req.body ?? {}) as { url?: unknown };
    if (typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ error: 'invalid_url', message: '유튜브 링크가 필요합니다.' });
      return;
    }

    const apiKey = await getUserApiKey(user.id, 'youtube');
    if (!apiKey) {
      res.status(200).json({ meta: null });
      return;
    }

    try {
      const meta = await fetchYoutubeVideoMeta(apiKey, url);
      res.status(200).json({ meta });
    } catch {
      res.status(200).json({ meta: null });
    }
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '영상 정보 조회 중 오류가 발생했습니다.',
    });
  }
}
