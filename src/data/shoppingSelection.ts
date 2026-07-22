import { useSyncExternalStore } from 'react';
import { shoppingSelectionRepo } from './repos';

// "장보기에 담은 레시피" 목록. 레시피 화면과 장보기 화면이 이 저장소를 공유해서,
// 레시피 상세에서 담은 내용이 탭을 전환해도 그대로 유지되도록 한다.
let cache: string[] = shoppingSelectionRepo.get();
const listeners = new Set<() => void>();

function notify() {
  cache = shoppingSelectionRepo.get();
  listeners.forEach((listener) => listener());
}

export function useShoppingSelection() {
  const selectedRecipeIds = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
  );

  function toggle(recipeId: string) {
    const current = shoppingSelectionRepo.get();
    const next = current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId];
    shoppingSelectionRepo.set(next);
    notify();
  }

  function isSelected(recipeId: string) {
    return selectedRecipeIds.includes(recipeId);
  }

  return { selectedRecipeIds, toggle, isSelected };
}
