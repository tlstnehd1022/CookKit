import { useSyncExternalStore } from 'react';

// 요리 모드의 "타이머 자동 시작"/"음성 인식 자동 시작" 선호는 기기별 UI 취향이라(household
// 공유 데이터가 아님) viewMode.ts/theme.ts와 같은 방식으로 localStorage에만 저장한다. 기본값은
// 둘 다 꺼짐 — 사용자가 아직 준비 안 됐을 수 있어 자동 동작은 명시적으로 켜야만 일어난다.
const TIMER_STORAGE_KEY = 'cookkit:cookingMode:autoStartTimer';
const VOICE_STORAGE_KEY = 'cookkit:cookingMode:autoStartVoice';
const SELECTED_VOICE_KEY = 'cookkit:cookingMode:selectedVoiceURI';

function readStoredBool(key: string): boolean {
  return localStorage.getItem(key) === 'true';
}

let currentAutoStartTimer = readStoredBool(TIMER_STORAGE_KEY);
let currentAutoStartVoice = readStoredBool(VOICE_STORAGE_KEY);
let currentSelectedVoiceURI: string | null = localStorage.getItem(SELECTED_VOICE_KEY);
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setAutoStartTimer(value: boolean) {
  currentAutoStartTimer = value;
  localStorage.setItem(TIMER_STORAGE_KEY, String(value));
  notify();
}

export function useAutoStartTimer(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentAutoStartTimer,
  );
}

/** 켜두면 요리 모드 진입 시 마이크가 자동으로 켜지고(탭 없이 바로 음성 명령을 들음), 요리 모드를
 * 나가면(완료 화면 도달 또는 종료) 자동으로 꺼진다. */
export function setAutoStartVoice(value: boolean) {
  currentAutoStartVoice = value;
  localStorage.setItem(VOICE_STORAGE_KEY, String(value));
  notify();
}

export function useAutoStartVoice(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentAutoStartVoice,
  );
}

/** 안내 음성(TTS)으로 쓸 SpeechSynthesisVoice.voiceURI — 미설정(null)이면 브라우저 기본 한국어
 * 음성을 쓴다. */
export function setSelectedVoiceURI(value: string | null) {
  currentSelectedVoiceURI = value;
  if (value) localStorage.setItem(SELECTED_VOICE_KEY, value);
  else localStorage.removeItem(SELECTED_VOICE_KEY);
  notify();
}

export function useSelectedVoiceURI(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentSelectedVoiceURI,
  );
}
