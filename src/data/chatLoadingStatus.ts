import { useSyncExternalStore } from 'react';

// RecipeChatPanel의 대화 응답 대기 상태를 App.tsx 상단 배너에서도 보여주기 위한 전역 store
// (imageGenerationStatus.ts와 같은 패턴) — RecipeChatPanel이 탭 전환으로 hidden 처리돼 있어도
// App.tsx가 계속 배너를 보여줄 수 있다. 진행률 개념이 없는 단발 호출이라 active 여부만 있다.
let active = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setChatLoading(value: boolean) {
  active = value;
  notify();
}

export function useChatLoading(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => active,
  );
}
