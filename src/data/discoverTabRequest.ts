import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

/** 레시피 추가/수정 화면에서 "다른 집 레시피 둘러보기"를 누르면 레시피 탭의 둘러보기 모드로
 * 이동시키는 신호(recipeSearchFocus.ts/profileSheet.ts와 같은 패턴). */
let requested = false;
const listeners = new Set<() => void>();

export function requestDiscoverTab() {
  requested = true;
  setActiveTab('recipes');
  listeners.forEach((listener) => listener());
}

export function useDiscoverTabRequested(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requested,
  );
}

export function clearDiscoverTabRequest() {
  requested = false;
  listeners.forEach((listener) => listener());
}
