import { useSyncExternalStore } from 'react';

// 이미지 일괄 생성("🖼 전체 이미지 생성") 진행 상태를 RecipeEditor 컴포넌트 바깥(App.tsx의
// 상단 배너/토스트)에서도 보여주기 위한 전역 store. RecipeEditor가 탭 전환으로 화면에서
// 안 보이는 동안에도(App.tsx가 hidden 처리만 하고 언마운트하지 않으므로) 생성 작업 자체는
// 계속 진행되는데, 그 진행률을 다른 탭에서도 볼 수 있어야 하므로 RecipeEditor의 로컬 state가
// 아니라 이 전역 store에도 같이 기록한다.
export interface ImageGenerationStatus {
  active: boolean;
  recipeName: string;
  done: number;
  total: number;
}

const IDLE_STATUS: ImageGenerationStatus = { active: false, recipeName: '', done: 0, total: 0 };

let status: ImageGenerationStatus = IDLE_STATUS;
let completionMessage: string | null = null;
let completionTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function startImageGenerationBatch(recipeName: string, total: number) {
  if (completionTimer) {
    clearTimeout(completionTimer);
    completionTimer = null;
  }
  completionMessage = null;
  status = { active: true, recipeName, done: 0, total };
  notify();
}

export function updateImageGenerationProgress(done: number) {
  if (!status.active) return;
  status = { ...status, done };
  notify();
}

export function finishImageGenerationBatch(failureCount: number) {
  const total = status.total;
  status = IDLE_STATUS;
  completionMessage =
    total === 0
      ? null
      : failureCount > 0
        ? `이미지 생성이 끝났어요 (${total - failureCount}/${total}개 성공)`
        : '이미지 생성이 완료됐어요 🎉';
  notify();
  if (completionMessage) {
    completionTimer = setTimeout(() => {
      completionMessage = null;
      completionTimer = null;
      notify();
    }, 5000);
  }
}

export function useImageGenerationStatus(): ImageGenerationStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}

export function useImageGenerationCompletionMessage(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => completionMessage,
  );
}
