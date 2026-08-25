import { useSyncExternalStore } from 'react';
import { setActiveTab } from './activeTab';

/** 안드로이드 "공유하기"로 CookKit에 들어온 내용(main.tsx가 /share-recipe 쿼리스트링을 읽어서
 * 세팅) — 유튜브/인스타그램 링크면 바로 변환 파이프라인으로, 아니면 대화 입력창에 미리 채워
 * 넣는다. */
export type SharedRecipeRequest = { linkUrl: string } | { chatText: string };

let current: SharedRecipeRequest | null = null;
const listeners = new Set<() => void>();

export function requestSharedRecipe(payload: SharedRecipeRequest) {
  current = payload;
  setActiveTab('recipes');
  listeners.forEach((listener) => listener());
}

export function useSharedRecipeRequest(): SharedRecipeRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

export function clearSharedRecipeRequest() {
  current = null;
  listeners.forEach((listener) => listener());
}
