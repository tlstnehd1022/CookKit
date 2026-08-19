import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

// 홈 화면 요소를 순서대로 안내하는 첫 사용 투어(OnboardingTour.tsx)의 "봤음" 플래그.
// household(가구) 공유가 아니라 기기별 localStorage — 같은 가구원이 다른 기기에서 처음
// 로그인하면 그 기기에서 한 번 더 볼 수 있어야 하므로 의도적으로 기기 단위로 저장한다.
const SEEN_KEY = 'cookkit:onboardingTourSeen';

export function hasSeenOnboardingTour(): boolean {
  return localStorage.getItem(SEEN_KEY) === 'true';
}

export function markOnboardingTourSeen(): void {
  localStorage.setItem(SEEN_KEY, 'true');
}

// 프로필 시트의 "앱 사용법 다시 보기"는 위 플래그와 무관하게 언제든 다시 실행할 수 있어야 해서,
// profileSheet.ts와 같은 신호 패턴(전역 store + 탭 전환)으로 HomePage에 "지금 투어를
// 시작해줘"를 전달한다.
let restartRequested = false;
const listeners = new Set<() => void>();

export function requestOnboardingTourRestart() {
  restartRequested = true;
  setActiveTab('home');
  listeners.forEach((listener) => listener());
}

export function useOnboardingTourRestartRequested(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => restartRequested,
  );
}

/** HomePage가 요청을 반영(투어 시작)한 직후 호출해 같은 요청이 다시 반응하지 않게 한다. */
export function clearOnboardingTourRestartRequest() {
  restartRequested = false;
  listeners.forEach((listener) => listener());
}
