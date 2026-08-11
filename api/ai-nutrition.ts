import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey } from './_lib/apiKeyStore.js';
import { estimateRecipeNutrition as claudeEstimateNutrition } from '../src/lib/claudeClient.js';
import { estimateRecipeNutrition as geminiEstimateNutrition } from '../src/lib/geminiClient.js';

// 레시피 재료를 근거로 1인분 기준 영양 정보를 추정한다 — 온디맨드 전용(사용자가 "영양 정보
// 계산하기"를 눌렀을 때만 호출됨, 자동 호출 없음). ai-chat.ts와 같은 두 제공자 분기 패턴.
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
    const { provider, model, recipe } = (req.body ?? {}) as {
      provider?: unknown;
      model?: unknown;
      recipe?: unknown;
    };

    if (provider !== 'anthropic' && provider !== 'gemini') {
      res.status(400).json({ error: 'invalid_provider', message: 'provider는 anthropic 또는 gemini여야 합니다.' });
      return;
    }
    if (typeof model !== 'string' || !model) {
      res.status(400).json({ error: 'invalid_model', message: '모델 ID가 필요합니다.' });
      return;
    }
    if (!recipe || typeof recipe !== 'object') {
      res.status(400).json({ error: 'invalid_recipe', message: '레시피 정보가 필요합니다.' });
      return;
    }

    const apiKey = await getUserApiKey(user.id, provider);
    if (!apiKey) {
      res.status(400).json({
        error: 'no_api_key',
        message: `${provider === 'gemini' ? 'Gemini' : 'Anthropic'} API 키가 없어요. 설정 화면에서 먼저 등록해주세요.`,
      });
      return;
    }

    const estimate = provider === 'gemini' ? geminiEstimateNutrition : claudeEstimateNutrition;
    const nutrition = await estimate(apiKey, model, recipe as Parameters<typeof estimate>[2]);
    res.status(200).json({ nutrition });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '영양 정보 추정 중 오류가 발생했습니다.',
    });
  }
}
