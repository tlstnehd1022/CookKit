import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey } from './_lib/apiKeyStore.js';
import { extractReceiptItems } from '../src/lib/geminiClient.js';

// 영수증 사진 → 식료품 품목 인식(Gemini 비전 전용 — 이미지 생성과 같은 이유로 aiProvider 설정과
// 무관하게 항상 Gemini 키를 씀). 인식 결과는 여기서 바로 재료에 반영되지 않고 클라이언트의 확인
// 화면(ReceiptScanModal)을 거쳐야만 실제로 저장된다 — 이 함수는 순수 인식만 담당.
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
    const { model, imageBase64, mimeType } = (req.body ?? {}) as {
      model?: unknown;
      imageBase64?: unknown;
      mimeType?: unknown;
    };

    if (typeof model !== 'string' || !model) {
      res.status(400).json({ error: 'invalid_model', message: '모델 ID가 필요합니다.' });
      return;
    }
    if (typeof imageBase64 !== 'string' || !imageBase64) {
      res.status(400).json({ error: 'invalid_image', message: '영수증 이미지가 필요합니다.' });
      return;
    }
    if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'invalid_image', message: '이미지 형식이 올바르지 않습니다.' });
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

    const items = await extractReceiptItems(apiKey, model, imageBase64, mimeType);
    res.status(200).json({ items });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : '영수증 인식 중 오류가 발생했습니다.',
    });
  }
}
