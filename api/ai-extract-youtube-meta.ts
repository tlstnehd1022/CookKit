import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey } from './_lib/apiKeyStore.js';
import { extractRecipeFromYoutubeMeta } from '../src/lib/geminiClient.js';

// 유튜브 영상 제목/설명란(+자막) → 레시피 구조화(Gemini 전용). 영상 제목/설명란 자체는
// YouTube Data API(settings.youtubeApiKey)로 클라이언트에서 이미 가져온 뒤 여기로 넘어옴 —
// 이 키는 이번 Vault 전환 대상이 아님(민감도가 낮은 읽기 전용 공개 데이터 조회용이라 범위 밖으로
// 남겨둠, CLAUDE.md 참고).
export const config = { maxDuration: 60 };

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
    const { model, meta, manualTranscript, existing } = (req.body ?? {}) as {
      model?: unknown;
      meta?: unknown;
      manualTranscript?: unknown;
      existing?: unknown;
    };

    if (typeof model !== 'string' || !model) {
      res.status(400).json({ error: 'invalid_model', message: '모델 ID가 필요합니다.' });
      return;
    }

    const apiKey = await getUserApiKey(user.id, 'gemini');
    if (!apiKey) {
      res.status(400).json({
        error: 'no_api_key',
        message: 'Gemini API 키가 없어요. 설정 화면에서 먼저 등록해주세요.',
      });
      return;
    }

    const result = await extractRecipeFromYoutubeMeta(
      apiKey,
      model,
      (meta ?? null) as Parameters<typeof extractRecipeFromYoutubeMeta>[2],
      typeof manualTranscript === 'string' ? manualTranscript : '',
      existing as Parameters<typeof extractRecipeFromYoutubeMeta>[4],
    );
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '레시피 추출 중 오류가 발생했습니다.',
    });
  }
}
