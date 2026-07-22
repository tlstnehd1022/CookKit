import { useSyncExternalStore } from 'react';
import { createLocalStorageKeyValue } from './localStorageAdapter';
import { DEFAULT_MODEL } from '../lib/claudeClient';

export interface AppSettings {
  anthropicApiKey: string;
  model: string;
}

const settingsRepo = createLocalStorageKeyValue<AppSettings>('cookkit:settings', {
  anthropicApiKey: '',
  model: DEFAULT_MODEL,
});

let cache = settingsRepo.get();
const listeners = new Set<() => void>();

function notify() {
  cache = settingsRepo.get();
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
