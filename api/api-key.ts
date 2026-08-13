import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { getUserApiKey, saveUserApiKey, maskApiKey, isValidApiKeyProvider } from './_lib/apiKeyStore.js';

// GET(조회)/save-api-key.ts(저장)를 하나로 합침 — 같은 리소스(사용자의 API 키)를 다루는
// 두 메서드라 REST식으로 자연스럽고, Vercel Hobby 플랜의 서버리스 함수 12개 제한 때문에도
// 필요했다(get-api-key.ts + save-api-key.ts + ai-extract-*.ts 통합으로 13개 → 11개).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const user = await requireUser(req);

    if (req.method === 'GET') {
      // 설정 화면에 마스킹된 키만 보여주기 위한 조회 — 평문 전체를 클라이언트로 내려보내지 않는다
      // (앞 6자리+****+뒤 4자리만). 실제 AI 호출에 쓰는 평문 키 조회는 api/ai-*.ts가 서버 내부에서만
      // getUserApiKey()를 직접 호출한다.
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
      return;
    }

    if (req.method === 'POST') {
      // 로그인한 사용자의 API 키를 Vault에 암호화 저장한다. anon 키로는 Vault에 접근할 수 없고
      // (0014 마이그레이션 참고) 이 함수만 SUPABASE_SERVICE_ROLE_KEY로 접근 가능 — 클라이언트는
      // 평문 키를 여기로 한 번 전송하고 나면 다시는 들고 있지 않는다(localStorage에 저장 안 함).
      const { provider, apiKey } = (req.body ?? {}) as { provider?: unknown; apiKey?: unknown };
      if (!isValidApiKeyProvider(provider)) {
        res
          .status(400)
          .json({ error: 'invalid_provider', message: 'provider는 anthropic, gemini, youtube 중 하나여야 합니다.' });
        return;
      }
      const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
      if (!trimmed) {
        res.status(400).json({ error: 'invalid_key', message: 'API 키를 입력해주세요.' });
        return;
      }
      await saveUserApiKey(user.id, provider, trimmed);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method_not_allowed', message: 'GET 또는 POST만 지원합니다.' });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'unauthorized', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'unknown',
      message: err instanceof Error ? err.message : 'API 키 처리 중 오류가 발생했습니다.',
    });
  }
}
