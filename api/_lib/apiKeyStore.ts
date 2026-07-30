import { getSupabaseAdmin } from './supabaseAdmin.js';

export type AiProvider = 'anthropic' | 'gemini';
export const VALID_PROVIDERS: AiProvider[] = ['anthropic', 'gemini'];

export function isValidProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && VALID_PROVIDERS.includes(value as AiProvider);
}

/** save_user_api_key(0014 마이그레이션) 호출 — 이미 키가 있으면 같은 vault secret을 갱신. */
export async function saveUserApiKey(userId: string, provider: AiProvider, apiKey: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('save_user_api_key', {
    p_user_id: userId,
    p_provider: provider,
    p_secret: apiKey,
  });
  if (error) throw error;
}

/** get_user_api_key(0014 마이그레이션) 호출 — 복호화된 키 전체를 반환(없으면 null). 이 값은
 * ai-*.ts에서 실제 AI 호출에만 쓰고, 클라이언트로는 절대 그대로 내려보내지 않는다. */
export async function getUserApiKey(userId: string, provider: AiProvider): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().rpc('get_user_api_key', {
    p_user_id: userId,
    p_provider: provider,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** 설정 화면 표시용 — "sk-ant****ab12"처럼 앞 6자리+****+뒤 4자리만 보여준다. */
export function maskApiKey(key: string): string {
  if (key.length <= 10) return '****';
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}
