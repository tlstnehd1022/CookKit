import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// service_role 키는 절대 VITE_ 접두사를 붙이면 안 됨 — Vite는 VITE_ 접두사가 붙은 환경변수를
// 클라이언트 번들에 그대로 인라인해서 브라우저에 노출시키므로, 이 키가 노출되면 Vault를 포함한
// DB 전체를 RLS 없이 접근할 수 있게 된다. Vercel 프로젝트 설정에서 SUPABASE_SERVICE_ROLE_KEY로만
// 등록할 것(서버리스 함수 실행 환경에서만 읽힘).
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_URL) 환경변수가 설정되지 않았습니다.');
  }
  cached = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cached;
}
