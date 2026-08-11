import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

/** 홈 화면의 검색 필드를 누르면 레시피 탭으로 이동하면서 그 탭의 검색창에 바로 포커스가
 * 가도록 하는 신호(profileSheet.ts와 같은 패턴). */
let focusRequested = false;
const listeners = new Set<() => void>();

export function requestRecipeSearchFocus() {
  focusRequested = true;
  setActiveTab('recipes');
  listeners.forEach((listener) => listener());
}

export function useRecipeSearchFocusRequested(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => focusRequested,
  );
}

export function clearRecipeSearchFocusRequest() {
  focusRequested = false;
  listeners.forEach((listener) => listener());
}
