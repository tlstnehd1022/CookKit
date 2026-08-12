import { useSyncExternalStore } from 'react';

/** 되돌리기 어려운 작업(냉장고 정리 적용, 재료/레시피 삭제, 요리 기록 재료 차감, 장보기→냉장고
 * 이동) 직후 토스트로 "실행 취소"를 잠깐 제공하는 전역 store — imageGenerationStatus.ts와 같은
 * useSyncExternalStore 패턴. 표시 시간(5초) 안에만 취소 가능하고, 취소 로직은 호출부가 직접
 * 만든 스냅샷 기반 복원 함수를 넘긴다(이 store는 "언제/무엇을 보여줄지"만 관리). */
export interface UndoToastState {
  message: string;
  onUndo: () => void | Promise<void>;
}

const UNDO_DURATION_MS = 5000;

let state: UndoToastState | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function showUndoToast(message: string, onUndo: () => void | Promise<void>) {
  if (hideTimer) clearTimeout(hideTimer);
  state = { message, onUndo };
  notify();
  hideTimer = setTimeout(() => {
    state = null;
    hideTimer = null;
    notify();
  }, UNDO_DURATION_MS);
}

export async function triggerUndo() {
  if (!state) return;
  const { onUndo } = state;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  state = null;
  notify();
  await onUndo();
}

export function useUndoToast(): UndoToastState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
