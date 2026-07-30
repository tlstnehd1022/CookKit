import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey } from './_lib/apiKeyStore.js';
import { chatAboutRecipe as claudeChatAboutRecipe } from '../src/lib/claudeClient.js';
import { chatAboutRecipe as geminiChatAboutRecipe } from '../src/lib/geminiClient.js';

// 대화형 레시피 생성/수정(propose_recipe 툴 포함)을 서버에서 대신 호출한다. 브라우저는 더 이상
// Anthropic/Gemini API 키를 들고 있지 않음 — 로그인 세션으로 본인 확인 후, Vault에 저장된 본인
// 키를 서버에서만 복호화해서 실제 API를 호출한다. 프롬프트/툴 정의는 src/lib/claudeClient.ts,
// src/lib/geminiClient.ts를 그대로 재사용(원래도 apiKey를 인자로 받는 순수 함수라 브라우저/
// 서버 양쪽에서 동일하게 동작함 — 로직 중복 없음).
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
    const { provider, model, history, useWebSearch, existing, currentRecipe } = (req.body ?? {}) as {
      provider?: unknown;
      model?: unknown;
      history?: unknown;
      useWebSearch?: unknown;
      existing?: unknown;
      currentRecipe?: unknown;
    };

    if (provider !== 'anthropic' && provider !== 'gemini') {
      res.status(400).json({ error: 'invalid_provider', message: 'provider는 anthropic 또는 gemini여야 합니다.' });
      return;
    }
    if (typeof model !== 'string' || !model) {
      res.status(400).json({ error: 'invalid_model', message: '모델 ID가 필요합니다.' });
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

    const chat = provider === 'gemini' ? geminiChatAboutRecipe : claudeChatAboutRecipe;
    const result = await chat(
      apiKey,
      model,
      history as Parameters<typeof chat>[2],
      Boolean(useWebSearch),
      existing as Parameters<typeof chat>[4],
      currentRecipe as Parameters<typeof chat>[5],
    );
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '대화 처리 중 오류가 발생했습니다.',
    });
  }
}
