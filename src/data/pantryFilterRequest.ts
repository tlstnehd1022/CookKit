import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

/** 냉장고 화면의 "지금 재료로 만들 수 있는 레시피" 배너(C-2)를 누르면 레시피 탭으로 이동하면서
 * "🧺 보유 재료로 가능" 필터가 적용된 상태로 열리게 하는 신호(profileSheet.ts/recipeSearchFocus.ts와
 * 같은 패턴). */
let requested = false;
const listeners = new Set<() => void>();

export function requestPantryOnlyFilter() {
  requested = true;
  setActiveTab('recipes');
  listeners.forEach((listener) => listener());
}

export function usePantryFilterRequested(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requested,
  );
}

export function clearPantryFilterRequest() {
  requested = false;
  listeners.forEach((listener) => listener());
}
