import { useSyncExternalStore } from 'react';
import { createLocalStorageKeyValue } from './localStorageAdapter';
import { DEFAULT_MODEL } from '../lib/claudeClient';
import { GEMINI_DEFAULT_MODEL } from '../lib/geminiClient';

export type AiProvider = 'anthropic' | 'gemini';

export interface AppSettings {
  aiProvider: AiProvider;
  anthropicApiKey: string;
  model: string;
  geminiApiKey: string;
  geminiModel: string;
  youtubeApiKey: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'gemini',
  anthropicApiKey: '',
  model: DEFAULT_MODEL,
  geminiApiKey: '',
  geminiModel: GEMINI_DEFAULT_MODEL,
  youtubeApiKey: '',
};

const settingsRepo = createLocalStorageKeyValue<Partial<AppSettings>>('cookkit:settings', DEFAULT_SETTINGS);

// 예전 버전에서 저장된 값에는 새로 추가된 필드(aiProvider, gemini*, youtubeApiKey)가 없을 수 있어
// 읽을 때마다 기본값과 병합한다.
function normalize(raw: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...raw };
}

let cache = normalize(settingsRepo.get());
const listeners = new Set<() => void>();

function notify() {
  cache = normalize(settingsRepo.get());
  listeners.forEach((listener) => listener());
}

export function useSettings() {
  const settings = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
  );

  function updateSettings(partial: Partial<AppSettings>) {
    settingsRepo.set({ ...settingsRepo.get(), ...partial });
    notify();
  }

  return { settings, updateSettings };
}
