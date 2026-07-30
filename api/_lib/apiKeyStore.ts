import { getSupabaseAdmin } from './supabaseAdmin.js';

// AI 호출(대화/이미지/추출)에 실제로 쓰이는 건 anthropic/gemini뿐이지만, 이 키 저장소 자체는
// YouTube Data API 키(0015)도 같은 방식으로 보관한다 — provider 선택지 3개는 "저장 가능한
// 키 종류"를 뜻할 뿐, "AI 제공자 선택"(settings.aiProvider)과는 다른 개념이다.
export type ApiKeyProvider = 'anthropic' | 'gemini' | 'youtube';
export const VALID_API_KEY_PROVIDERS: ApiKeyProvider[] = ['anthropic', 'gemini', 'youtube'];

export function isValidApiKeyProvider(value: unknown): value is ApiKeyProvider {
  return typeof value === 'string' && VALID_API_KEY_PROVIDERS.includes(value as ApiKeyProvider);
}

/** save_user_api_key(0014/0015 마이그레이션) 호출 — 이미 키가 있으면 같은 vault secret을 갱신. */
export async function saveUserApiKey(userId: string, provider: ApiKeyProvider, apiKey: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('save_user_api_key', {
    p_user_id: userId,
    p_provider: provider,
    p_secret: apiKey,
  });
  if (error) throw error;
}

/** get_user_api_key(0014 마이그레이션) 호출 — 복호화된 키 전체를 반환(없으면 null). 이 값은
 * ai-*.ts에서 실제 AI 호출에만 쓰고, 클라이언트로는 절대 그대로 내려보내지 않는다. */
export async function getUserApiKey(userId: string, provider: ApiKeyProvider): Promise<string | null> {
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
