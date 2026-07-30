import { useSyncExternalStore } from 'react';

export type Tab = 'recipes' | 'shopping' | 'ingredients' | 'settings';

// theme.ts/viewMode.ts와 같은 전역 store 패턴 — App.tsx의 탭 state를 여기로 옮겨서, 다른
// 화면(레시피 채팅/편집 등)에서 "API 키가 없어요, 설정으로 이동" 버튼처럼 탭을 직접 전환해야
// 하는 경우에도 쓸 수 있게 함(예전엔 App.tsx 로컬 useState라 바깥에서 건드릴 방법이 없었음).
let currentTab: Tab = 'recipes';
const listeners = new Set<() => void>();

export function setActiveTab(tab: Tab) {
  currentTab = tab;
  listeners.forEach((listener) => listener());
}

export function useActiveTab(): Tab {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentTab,
  );
}
