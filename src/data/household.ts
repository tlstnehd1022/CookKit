import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSession } from './session';

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
}

/**
 * 로그인한 사용자가 속한 household를 조회한다. 아직 어떤 household에도 속하지 않았으면
 * household는 null — 이 경우 App.tsx가 HouseholdOnboarding 화면으로 유도한다.
 */
export function useHousehold() {
  const { user } = useSession();
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  // user?.id로만 의존성을 걸어둔다 — session.ts의 onAuthStateChange는 탭이 백그라운드에
  // 있다가 다시 포커스를 받을 때 Supabase가 세션을 재확인하면서 같은 계정인데도 매번 새
  // 객체 참조로 user를 갱신하는 경우가 있다(TOKEN_REFRESHED 등). refresh를 user 객체
  // 전체에 의존시키면 그때마다 useEffect가 다시 실행되어 loading을 true로 되돌리고,
  // App.tsx가 householdLoading일 때 전체 트리를 null로 반환(언마운트)하기 때문에 —
  // 다른 앱/브라우저 탭에 갔다 오면 레시피 편집/채팅 중이던 화면이 초기화되는 버그로
  // 이어졌었다. 실제 계정이 바뀐 경우(로그인/로그아웃)에만 다시 조회하도록 id 문자열
  // 하나로만 의존성을 좁힌다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    if (!user) {
      setHousehold(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      setHousehold(null);
      setLoading(false);
      return;
    }

    const { data: row } = await supabase
      .from('households')
      .select('id, name, invite_code')
      .eq('id', membership.household_id)
      .maybeSingle();

    setHousehold(row ? { id: row.id, name: row.name, inviteCode: row.invite_code } : null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { household, loading, refresh };
}
