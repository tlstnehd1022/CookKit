import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

/** 홈의 "⏱ 20분 안에 되는 것" 섹션(A-1) "전체 보기"를 누르면 레시피 탭으로 이동하면서
 * 조리시간 필터가 적용된 상태로 열리게 하는 신호(pantryFilterRequest.ts와 같은 패턴). */
let requestedMaxMinutes: number | null = null;
const listeners = new Set<() => void>();

export function requestMaxMinutesFilter(minutes: number) {
  requestedMaxMinutes = minutes;
  setActiveTab('recipes');
  listeners.forEach((listener) => listener());
}

export function useRequestedMaxMinutesFilter(): number | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requestedMaxMinutes,
  );
}

export function clearMaxMinutesFilterRequest() {
  requestedMaxMinutes = null;
  listeners.forEach((listener) => listener());
}
