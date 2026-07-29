import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSession } from './session';

export interface Profile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * 로그인한 사용자의 profiles 행(닉네임 등)을 조회/수정한다. display_name은 가입 시
 * handle_new_user() 트리거가 구글 계정 이름(raw_user_meta_data->>'full_name')으로 자동
 * 채워두지만, 이후 사용자가 설정 화면에서 직접 바꿀 수 있다(profiles_update_own RLS로
 * 이미 본인 행 수정은 허용되어 있어 별도 마이그레이션 불필요).
 */
export function useProfile() {
  const { user } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // useHousehold()와 같은 이유로 user?.id로만 의존성을 좁힌다(household.ts의 설명 참고).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    setProfile(
      data
        ? { id: data.id, displayName: data.display_name ?? '', email: data.email, avatarUrl: data.avatar_url }
        : null,
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function updateDisplayName(name: string) {
    if (!user) return;
    const trimmed = name.trim();
    const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id);
    if (error) throw error;
    setProfile((p) => (p ? { ...p, displayName: trimmed } : p));
  }

  return { profile, loading, updateDisplayName, refresh };
}
