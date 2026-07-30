import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth';
import { saveUserApiKey, isValidProvider } from './_lib/apiKeyStore';

// 로그인한 사용자의 API 키를 Vault에 암호화 저장한다. anon 키로는 Vault에 접근할 수 없고
// (0014 마이그레이션 참고) 이 함수만 SUPABASE_SERVICE_ROLE_KEY로 접근 가능 — 클라이언트는
// 평문 키를 여기로 한 번 전송하고 나면 다시는 들고 있지 않는다(localStorage에 저장 안 함).
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
    const { provider, apiKey } = (req.body ?? {}) as { provider?: unknown; apiKey?: unknown };

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: 'invalid_provider', message: 'provider는 anthropic 또는 gemini여야 합니다.' });
      return;
    }
    const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'invalid_key', message: 'API 키를 입력해주세요.' });
      return;
    }

    await saveUserApiKey(user.id, provider, trimmed);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : 'API 키 저장 중 오류가 발생했습니다.',
    });
  }
}
