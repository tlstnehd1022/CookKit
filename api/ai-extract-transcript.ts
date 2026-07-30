import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth';
import { getUserApiKey } from './_lib/apiKeyStore';
import { extractRecipeFromTranscript } from '../src/lib/claudeClient';

// 유튜브 자막 텍스트 → 레시피 구조화(Claude 전용, RecipeEditor.tsx가 aiProvider==='anthropic'
// 일 때만 호출). Gemini는 별도로 api/ai-extract-youtube-meta.ts를 쓴다(기존에도 제공자별로
// 다른 입력을 쓰던 로직 그대로 유지 — 여기선 "어디서 키를 가져오느냐"만 서버로 옮김).
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
    const { model, transcriptText, existing } = (req.body ?? {}) as {
      model?: unknown;
      transcriptText?: unknown;
      existing?: unknown;
    };

    if (typeof model !== 'string' || !model) {
      res.status(400).json({ error: 'invalid_model', message: '모델 ID가 필요합니다.' });
      return;
    }
    if (typeof transcriptText !== 'string' || !transcriptText.trim()) {
      res.status(400).json({ error: 'invalid_transcript', message: '자막 텍스트가 필요합니다.' });
      return;
    }

    const apiKey = await getUserApiKey(user.id, 'anthropic');
    if (!apiKey) {
      res.status(400).json({
        error: 'no_api_key',
        message: 'Anthropic API 키가 없어요. 설정 화면에서 먼저 등록해주세요.',
      });
      return;
    }

    const result = await extractRecipeFromTranscript(
      apiKey,
      model,
      transcriptText,
      existing as Parameters<typeof extractRecipeFromTranscript>[3],
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
