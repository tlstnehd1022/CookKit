import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export class AuthError extends Error {}

/**
 * Authorization: Bearer <access_token> 헤더를 Supabase Auth로 검증해서 로그인한 사용자를
 * 반환한다. 여기서는 anon 키만 사용(토큰 서명 검증일 뿐, service_role이 필요 없음) —
 * service_role은 검증된 user_id로 Vault에 접근할 때만(_lib/apiKeyStore.ts) 쓴다.
 */
export async function requireUser(req: VercelRequest): Promise<{ id: string }> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) throw new AuthError('로그인이 필요합니다.');

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase 환경변수(SUPABASE_URL/SUPABASE_ANON_KEY)가 설정되지 않았습니다.');
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new AuthError('세션이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.');
  }
  return { id: data.user.id };
}
