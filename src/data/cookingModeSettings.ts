import { useSyncExternalStore } from 'react';

// 요리 모드의 "타이머 자동 시작" 선호는 기기별 UI 취향이라(household 공유 데이터가 아님)
// viewMode.ts/theme.ts와 같은 방식으로 localStorage에만 저장한다. 기본값은 꺼짐 — 사용자가
// 아직 준비 안 됐을 수 있어 자동 시작은 명시적으로 켜야만 동작한다.
const STORAGE_KEY = 'cookkit:cookingMode:autoStartTimer';

function readStored(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

let current = readStored();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setAutoStartTimer(value: boolean) {
  current = value;
  localStorage.setItem(STORAGE_KEY, String(value));
  notify();
}

export function useAutoStartTimer(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
