import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'cookkit:theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredTheme(): ThemeMode | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function applyThemeToDocument(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
}

// 저장된 값이 있으면 그 값을, 없으면(최초 진입) OS 다크모드 설정을 기본값으로 사용한다.
// 이후 사용자가 직접 토글하면 저장된 값이 항상 시스템 설정보다 우선한다.
let currentTheme: ThemeMode = readStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
applyThemeToDocument(currentTheme);

const listeners = new Set<() => void>();

export function setTheme(theme: ThemeMode) {
  currentTheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  applyThemeToDocument(theme);
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentTheme,
  );
  return { theme, setTheme, toggleTheme };
}
