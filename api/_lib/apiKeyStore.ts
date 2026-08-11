import { getSupabaseAdmin } from './supabaseAdmin.js';

// src/data/apiKeys.ts에도 이 타입이 동일하게 정의되어 있다(중복) — 하지만 그쪽을 import type으로
// 가져오면 그 파일의 다른 import(react, supabaseClient 등)까지 타입체커가 같이 훑게 되어
// api/ 서버리스 함수 번들링 경계를 넘게 된다(로컬에서 검증하기 어려운 위험 — api/는 tsc -b
// 대상에 아예 포함되지 않아 이런 문제가 로컬 빌드로는 안 잡힌다). 그래서 통합하지 않고 각자
// 독립적으로 정의된 상태를 유지한다 — 값 3개짜리 문자열 유니온이라 나중에 한쪽만 바뀌는 실수를
// 하지 않도록 값을 바꿀 땐 두 파일 다 확인할 것.
export type ApiKeyProvider = 'anthropic' | 'gemini' | 'youtube';
const VALID_API_KEY_PROVIDERS: ApiKeyProvider[] = ['anthropic', 'gemini', 'youtube'];

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
