import { useSyncExternalStore } from 'react';
import { createLocalStorageKeyValue } from './localStorageAdapter';

export interface SessionUser {
  id: string;
  name: string;
}

// 지금은 실제 인증 없이 고정 사용자로 "로그인"한다.
// 나중에 진짜 로그인(Supabase Auth 등)을 붙일 때는 login() 내부 구현만 교체하면 된다.
export const CURRENT_USER_ID = 'user-manual';
const FIXED_USER: SessionUser = { id: CURRENT_USER_ID, name: '수동' };

const sessionRepo = createLocalStorageKeyValue<SessionUser | null>('cookkit:session', null);

let cache = sessionRepo.get();
const listeners = new Set<() => void>();

function notify() {
  cache = sessionRepo.get();
  listeners.forEach((listener) => listener());
}

export function useSession() {
  const user = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
  );

  function login() {
    sessionRepo.set(FIXED_USER);
    notify();
  }

  function logout() {
    sessionRepo.set(null);
    notify();
  }

  return { user, login, logout };
}
