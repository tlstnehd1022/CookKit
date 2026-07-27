import { useSyncExternalStore } from 'react';

// 레시피 목록의 그리드/리스트 뷰 선택은 기기별 UI 취향이라(household 공유 데이터가 아님)
// theme.ts와 같은 방식으로 localStorage에만 저장한다.
export type RecipeViewMode = 'grid' | 'list';

const STORAGE_KEY = 'cookkit:recipeViewMode';

function readStored(): RecipeViewMode {
  return localStorage.getItem(STORAGE_KEY) === 'list' ? 'list' : 'grid';
}

let currentMode: RecipeViewMode = readStored();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setRecipeViewMode(mode: RecipeViewMode) {
  currentMode = mode;
  localStorage.setItem(STORAGE_KEY, mode);
  notify();
}

export function useRecipeViewMode() {
  const mode = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentMode,
  );
  return { mode, setMode: setRecipeViewMode };
}
