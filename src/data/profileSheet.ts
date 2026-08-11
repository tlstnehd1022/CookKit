import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

/**
 * 예전엔 "설정" 탭이 따로 있어서 setActiveTab('settings')만 호출하면 됐지만, 설정 탭을 없애고
 * 홈 화면 우상단 프로필 아이콘 → 바텀시트로 옮기면서(디자인 시스템 전면 교체), 앱 곳곳에 있던
 * "API 키가 없어요, 설정으로 이동" 같은 버튼들이 갈 곳이 없어졌다. 이 store가 그 다리 역할 —
 * 홈 탭으로 이동시키고 "바텀시트를 열어달라"는 신호를 HomePage에 전달한다.
 */
let openRequested = false;
const listeners = new Set<() => void>();

export function requestProfileSheet() {
  openRequested = true;
  setActiveTab('home');
  listeners.forEach((listener) => listener());
}

export function useProfileSheetRequested(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => openRequested,
  );
}

/** HomePage가 요청을 반영(바텀시트 오픈)한 직후 호출해 같은 요청이 다시 반응하지 않게 한다. */
export function clearProfileSheetRequest() {
  openRequested = false;
  listeners.forEach((listener) => listener());
}
