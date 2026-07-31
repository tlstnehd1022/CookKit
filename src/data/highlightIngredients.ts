import { useSyncExternalStore } from 'react';

// activeTab.ts와 같은 전역 store 패턴 — 유통기한 알림을 클릭했을 때 어떤 재료(id)를 강조
// 표시할지 IngredientsPage.tsx에 전달하기 위함(main.tsx가 SW 메시지/쿼리스트링을 읽어서 세팅).
let currentIds: string[] = [];
const listeners = new Set<() => void>();

export function setHighlightIngredientIds(ids: string[]) {
  currentIds = ids;
  listeners.forEach((listener) => listener());
}

export function clearHighlightIngredientIds() {
  if (currentIds.length === 0) return;
  setHighlightIngredientIds([]);
}

export function useHighlightIngredientIds(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentIds,
  );
}
