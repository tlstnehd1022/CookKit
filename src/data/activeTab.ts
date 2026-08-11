import { useSyncExternalStore } from 'react';

// 22차 확장(디자인 시스템 전면 교체)에서 5번째 탭이던 "설정"을 제거하고 홈 우상단 프로필
// 진입점(바텀시트)으로 옮겼다 — "설정으로 이동" 버튼들은 이제 setActiveTab('settings') 대신
// src/data/profileSheet.ts의 requestProfileSheet()를 쓴다.
export type Tab = 'home' | 'recipes' | 'ingredients' | 'shopping';

// theme.ts/viewMode.ts와 같은 전역 store 패턴 — App.tsx의 탭 state를 여기로 옮겨서, 다른
// 화면(레시피 채팅/편집 등)에서 탭을 직접 전환해야 하는 경우에도 쓸 수 있게 함(예전엔 App.tsx
// 로컬 useState라 바깥에서 건드릴 방법이 없었음).
let currentTab: Tab = 'home';
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
