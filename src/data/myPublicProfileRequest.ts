import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

/** 프로필 바텀시트의 "내 공개 프로필 보기"를 누르면 레시피 탭으로 이동시키는 신호
 * (discoverTabRequest.ts/sharedRecipeRequest.ts와 같은 패턴). */
let requested = false;
const listeners = new Set<() => void>();

export function requestMyPublicProfile() {
  requested = true;
  setActiveTab('recipes');
  listeners.forEach((listener) => listener());
}

export function useMyPublicProfileRequested(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requested,
  );
}

export function clearMyPublicProfileRequest() {
  requested = false;
  listeners.forEach((listener) => listener());
}
