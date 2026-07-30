import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSession } from './session';
import { getErrorMessage } from '../lib/errorMessage';
import type { AiProvider } from './settings';

export interface ApiKeyStatus {
  hasKey: boolean;
  maskedKey?: string;
}

/**
 * 설정 화면에서 Anthropic/Gemini API 키의 저장 여부(마스킹된 값)를 조회하고 새 키를 저장한다.
 * 실제 평문 키는 클라이언트에 전혀 내려오지 않음 — 저장은 api/save-api-key.ts, 조회는
 * api/get-api-key.ts(마스킹된 값만 반환)를 거친다. household.ts/profile.ts와 같은 패턴.
 */
export function useApiKeyStatus(provider: AiProvider) {
  const { user } = useSession();
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setStatus(null);
        return;
      }
      const res = await fetch(`/api/get-api-key?provider=${provider}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? 'API 키 조회에 실패했습니다.');
      setStatus(data as ApiKeyStatus);
    } catch (err) {
      setError(getErrorMessage(err, 'API 키 조회에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function saveKey(apiKey: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error('로그인이 필요합니다.');
    const res = await fetch('/api/save-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ provider, apiKey }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? 'API 키 저장에 실패했습니다.');
    await refresh();
  }

  return { status, loading, error, saveKey, refresh };
}
