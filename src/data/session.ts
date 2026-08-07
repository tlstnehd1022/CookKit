import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /** 구글 로그인 시 제공되는 프로필 사진 URL(user_metadata) — 이메일 로그인 사용자는 없음.
   * 설정 화면의 "구글 사진으로 되돌리기"가 이 값을 참고한다. */
  googleAvatarUrl?: string;
}

// 데이터 레이어(repos.ts)가 아직 이 고정 값을 네임스페이스로 쓰고 있음 — 재료/레시피 등을
// 실제 로그인 사용자별로 나누는 작업(Phase 3, Supabase 데이터 레이어 전환)이 끝나기 전까지는
// 어떤 구글 계정으로 로그인하든 예전과 같은 로컬 데이터를 그대로 보게 된다(의도된 과도기 상태).
export const CURRENT_USER_ID = 'user-manual';

function toSessionUser(session: Session | null): SessionUser | null {
  const user = session?.user;
  if (!user) return null;
  const metadata = user.user_metadata as
    | { full_name?: string; name?: string; avatar_url?: string; picture?: string }
    | undefined;
  return {
    id: user.id,
    name: metadata?.full_name ?? metadata?.name ?? user.email ?? '사용자',
    email: user.email ?? '',
    googleAvatarUrl: metadata?.avatar_url ?? metadata?.picture ?? undefined,
  };
}

let currentUser: SessionUser | null = null;
// 새로고침 직후 Supabase가 기존 세션을 복원하는 동안(비동기) true — 로그인 화면이 잠깐
// 잘못 보였다가 바뀌는 깜빡임을 막는 데 쓴다.
let sessionLoaded = false;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = toSessionUser(session);
  sessionLoaded = true;
  notify();
});

export function useSession() {
  const user = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentUser,
  );
  const loaded = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => sessionLoaded,
  );

  async function login() {
    // 구글 로그인 화면으로 리다이렉트됨 — 이 함수 자체는 로그인 완료를 기다리지 않고,
    // 완료 후 되돌아오면 위 onAuthStateChange가 실제 세션을 반영한다.
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return { user, loaded, login, logout };
}
