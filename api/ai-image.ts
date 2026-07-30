import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth';
import { getUserApiKey } from './_lib/apiKeyStore';
import { generateImageWithRetry } from '../src/lib/geminiClient';

// 조리 단계/완성 사진 이미지 생성(Gemini 전용 — Claude는 이미지 생성 미지원, aiProvider 설정과
// 무관하게 항상 Gemini 키를 씀, 기존 클라이언트 로직과 동일). generateImageWithRetry 안에서
// 이미 60초 타임아웃 + 429/503/408 재시도(최대 3회, 지수 백오프)를 처리하므로 여기선 그대로
// 호출만 한다 — 재시도까지 감안해 함수 실행시간을 넉넉히 잡아둠(60+2+60+4+60초 최악 케이스).
export const config = { maxDuration: 200 };

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
    const { model, prompt } = (req.body ?? {}) as { model?: unknown; prompt?: unknown };

    if (typeof model !== 'string' || !model) {
      res.status(400).json({ error: 'invalid_model', message: '모델 ID가 필요합니다.' });
      return;
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'invalid_prompt', message: '이미지 프롬프트가 필요합니다.' });
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

    const dataUrl = await generateImageWithRetry(apiKey, model, prompt);
    res.status(200).json({ dataUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.',
    });
  }
}
