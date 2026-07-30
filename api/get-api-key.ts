import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey, maskApiKey, isValidApiKeyProvider } from './_lib/apiKeyStore.js';

// 설정 화면에 마스킹된 키만 보여주기 위한 조회 — 평문 전체를 클라이언트로 내려보내지 않는다
// (앞 6자리+****+뒤 4자리만). 실제 AI 호출에 쓰는 평문 키 조회는 api/ai-*.ts가 서버 내부에서만
// getUserApiKey()를 직접 호출한다.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const user = await requireUser(req);
    const provider = typeof req.query.provider === 'string' ? req.query.provider : '';

    if (!isValidApiKeyProvider(provider)) {
      res
        .status(400)
        .json({ error: 'invalid_provider', message: 'provider는 anthropic, gemini, youtube 중 하나여야 합니다.' });
      return;
    }

    const key = await getUserApiKey(user.id, provider);
    if (!key) {
      res.status(200).json({ hasKey: false });
      return;
    }
    res.status(200).json({ hasKey: true, maskedKey: maskApiKey(key) });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : 'API 키 조회 중 오류가 발생했습니다.',
    });
  }
}
