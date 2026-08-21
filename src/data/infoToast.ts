import { useSyncExternalStore } from 'react';

// 짧게 보여주고 자동으로 사라지는 완료 안내 토스트(App.tsx의 .toast) — undoToast.ts와 달리
// "실행 취소" 같은 액션이 없는 단순 안내용. 유튜브 변환 완료 등에 쓴다(대화 응답은 말풍선이
// 뜨는 것 자체가 완료 신호라 별도 토스트를 띄우지 않음, 이미지 생성은 기존
// imageGenerationStatus.ts의 전용 완료 메시지를 그대로 씀).
const DURATION_MS = 4000;

let message: string | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function showInfoToast(text: string) {
  if (hideTimer) clearTimeout(hideTimer);
  message = text;
  notify();
  hideTimer = setTimeout(() => {
    message = null;
    hideTimer = null;
    notify();
  }, DURATION_MS);
}

export function useInfoToast(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => message,
  );
}
