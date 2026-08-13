import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey } from './_lib/apiKeyStore.js';
import { extractRecipeFromTranscript } from '../src/lib/claudeClient.js';
import { extractRecipeFromYoutubeMeta } from '../src/lib/geminiClient.js';

// 유튜브 자막/메타 → 레시피 구조화 — 제공자별로 입력 형태가 달라(Claude는 자막 텍스트만,
// Gemini는 영상 메타+자막) 하나의 함수로 합치지 않고 provider로 분기한다. 원래
// ai-extract-transcript.ts(Claude)/ai-extract-youtube-meta.ts(Gemini) 두 함수였는데, Vercel
// Hobby 플랜의 서버리스 함수 12개 제한 때문에 하나로 합침(api-key.ts 통합과 같은 이유).
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
    const { provider, model, transcriptText, meta, manualTranscript, existing } = (req.body ?? {}) as {
      provider?: unknown;
      model?: unknown;
      transcriptText?: unknown;
      meta?: unknown;
      manualTranscript?: unknown;
      existing?: unknown;
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

    if (provider === 'anthropic') {
      if (typeof transcriptText !== 'string' || !transcriptText.trim()) {
        res.status(400).json({ error: 'invalid_transcript', message: '자막 텍스트가 필요합니다.' });
        return;
      }
      const result = await extractRecipeFromTranscript(
        apiKey,
        model,
        transcriptText,
        existing as Parameters<typeof extractRecipeFromTranscript>[3],
      );
      res.status(200).json(result);
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
