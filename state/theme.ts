// Theme distribution via Zustand.
//
// CLAUDE.md mandates Zustand for cross-screen state, and a theme is the
// archetypal cross-screen value: every screen reads it, no screen mutates it
// today. The store is intentionally minimal in this build — only `mode:
// 'light'` is wired. System/Dark mode wiring is build-order step 8 (Settings
// polish) and will extend this store rather than replace it.
//
// Consumers call `useTheme()` and get back the resolved Theme object. They
// never read mode directly — that keeps screens insulated from the eventual
// "system" → "light" | "dark" resolution that lands later.

import { create } from 'zustand';

import { lightTheme, type Theme } from '../styles/theme';

type ThemeMode = 'light';

interface ThemeStore {
  mode: ThemeMode;
  theme: Theme;
}

// Single state shape. No setters yet — adding `setMode` and the system/dark
// resolution belongs to step 8.
const useThemeStore = create<ThemeStore>(() => ({
  mode: 'light',
  theme: lightTheme,
}));

export function useTheme(): Theme {
  return useThemeStore((s) => s.theme);
}
