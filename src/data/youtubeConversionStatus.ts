import { useSyncExternalStore } from 'react';

// RecipeEditor의 유튜브 변환 진행 상태를 App.tsx 상단 배너에서도 보여주기 위한 전역 store
// (imageGenerationStatus.ts와 같은 패턴). 자막 추출/레시피 분석 2단계라 정확한 퍼센트는 없지만,
// 지금 어느 단계인지는 실제로 알고 있어 그 단계에 맞는 대략적인 진행률을 보여준다.
export type YoutubeConversionStage = 'extracting' | 'analyzing';

export interface YoutubeConversionStatus {
  active: boolean;
  stage: YoutubeConversionStage;
}

const IDLE_STATUS: YoutubeConversionStatus = { active: false, stage: 'extracting' };

let status: YoutubeConversionStatus = IDLE_STATUS;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function startYoutubeConversion() {
  status = { active: true, stage: 'extracting' };
  notify();
}

export function setYoutubeConversionStage(stage: YoutubeConversionStage) {
  if (!status.active) return;
  status = { ...status, stage };
  notify();
}

export function finishYoutubeConversion() {
  status = IDLE_STATUS;
  notify();
}

export function useYoutubeConversionStatus(): YoutubeConversionStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}
