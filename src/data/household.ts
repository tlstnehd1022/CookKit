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
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { household, loading, refresh };
}
