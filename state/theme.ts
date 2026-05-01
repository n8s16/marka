// Theme distribution via Zustand.
//
// CLAUDE.md mandates Zustand for cross-screen state, and a theme is the
// archetypal cross-screen value: every screen reads it, no screen mutates it
// directly except through `setThemeMode` from the picker.
//
// Three modes are supported, mirroring the iOS Settings convention:
//
//   - 'light'  — always light, regardless of OS setting
//   - 'dark'   — always dark, regardless of OS setting
//   - 'system' — follow the device's appearance setting; flip live when it
//                changes (e.g. iOS day/night auto-switch)
//
// `useTheme()` returns the resolved Theme object — consumers don't read the
// raw `mode` field. That keeps screens insulated from the system→light/dark
// resolution rule, and means switching modes is a pure state update with no
// per-screen plumbing.
//
// Persistence: only the user's chosen `mode` is persisted (via AsyncStorage
// under the `marka-theme` key). `systemColorScheme` is derived from the OS
// at runtime and not stored. Default is 'system' so first-run respects the
// device.
//
// Initial OS scheme is read once at module load via `Appearance.getColorScheme()`,
// and a single Appearance change listener keeps it in sync. The listener is
// installed at module load (not per-component), so subscribers don't pay any
// extra cost.

import { Appearance, type ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { darkTheme, lightTheme, type Theme } from '../styles/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedScheme = 'light' | 'dark';

interface ThemeStore {
  mode: ThemeMode;
  systemColorScheme: ResolvedScheme;
  setMode: (mode: ThemeMode) => void;
  setSystemColorScheme: (scheme: ResolvedScheme) => void;
}

// Normalize the OS-reported scheme to our binary 'light' | 'dark'. RN can
// return null (e.g. on web before mount); we treat null as 'light' to match
// our default Theme. The `Appearance` listener also follows this rule.
function normalizeScheme(scheme: ColorSchemeName): ResolvedScheme {
  return scheme === 'dark' ? 'dark' : 'light';
}

const initialSystemScheme: ResolvedScheme = normalizeScheme(
  Appearance.getColorScheme(),
);

const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'system',
      systemColorScheme: initialSystemScheme,
      setMode: (mode) => set({ mode }),
      setSystemColorScheme: (scheme) => set({ systemColorScheme: scheme }),
    }),
    {
      name: 'marka-theme',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the user's chosen mode is persisted; systemColorScheme is
      // derived from the OS and re-read on every cold start.
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);

// Single Appearance subscription, installed at module load. Avoids each
// component setting up its own listener and keeps state mutations centralized.
Appearance.addChangeListener(({ colorScheme }) => {
  useThemeStore.getState().setSystemColorScheme(normalizeScheme(colorScheme));
});

/**
 * Resolved active theme — light or dark, with the user's mode preference
 * applied (system mode resolves to whatever the OS reports). Components
 * read this and don't care about mode resolution.
 */
export function useTheme(): Theme {
  return useThemeStore((s) => {
    const resolved =
      s.mode === 'system' ? s.systemColorScheme : (s.mode as ResolvedScheme);
    return resolved === 'dark' ? darkTheme : lightTheme;
  });
}

/**
 * The user's chosen mode (NOT the resolved scheme). Used by the picker UI to
 * render which option is active. A user with mode='system' on a dark device
 * sees 'system' selected, not 'dark'.
 */
export function useThemeMode(): ThemeMode {
  return useThemeStore((s) => s.mode);
}

/**
 * Setter for the picker. Calling this with the user's chosen mode commits
 * immediately — no save button, same UX as the iOS Settings appearance picker.
 */
export function setThemeMode(mode: ThemeMode): void {
  useThemeStore.getState().setMode(mode);
}
