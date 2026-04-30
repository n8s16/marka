// Theme definitions. Composes the primitives in tokens.ts into named
// `lightTheme` and `darkTheme` objects. Every color used by a component
// must come from `theme.colors.*` so light/dark switches are automatic.
//
// Wallet brand colors are NOT part of `theme.colors` — they're cross-theme
// constants exposed via `theme.walletBrand` for ergonomic access.

import {
  borderWidth,
  fontSize,
  fontWeight,
  lineHeight,
  opacity,
  radii,
  space,
  walletBrand,
} from './tokens';

type ThemeColors = {
  bg: string; // screen background
  surface: string; // card / sheet background
  surfaceMuted: string; // sub-surface, pressed state, alternating rows
  text: string; // primary text
  textMuted: string; // secondary text, metadata
  textFaint: string; // tertiary, e.g. small all-caps "BILLS" labels
  border: string; // hairlines and dividers
  borderStrong: string; // emphasized borders, e.g. focused input
  accent: string; // app-level affordance color (NOT wallet identity)
  success: string; // 'paid' confirmations
  warning: string; // 'overdue' / soft warnings
  danger: string; // hard errors / destructive actions
};

type ThemeTypography = {
  title: {
    sm: { fontSize: number; fontWeight: typeof fontWeight.medium; lineHeight: number };
    md: { fontSize: number; fontWeight: typeof fontWeight.medium; lineHeight: number };
  };
  body: {
    sm: { fontSize: number; fontWeight: typeof fontWeight.regular; lineHeight: number };
    md: { fontSize: number; fontWeight: typeof fontWeight.regular; lineHeight: number };
  };
  label: {
    sm: { fontSize: number; fontWeight: typeof fontWeight.regular; lineHeight: number };
    md: { fontSize: number; fontWeight: typeof fontWeight.regular; lineHeight: number };
  };
  weights: typeof fontWeight;
};

export type Theme = {
  mode: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof space;
  typography: ThemeTypography;
  radii: typeof radii;
  borderWidth: typeof borderWidth;
  opacity: typeof opacity;
  walletBrand: typeof walletBrand;
};

// Typography composed from tokens. Titles default to medium weight, body and
// label default to regular. Consumers can override weight per-use; these are
// the defaults for the hierarchy described in the agent definition.
const typography: ThemeTypography = {
  title: {
    sm: {
      fontSize: fontSize.title.sm,
      fontWeight: fontWeight.medium,
      lineHeight: Math.round(fontSize.title.sm * lineHeight.tight),
    },
    md: {
      fontSize: fontSize.title.md,
      fontWeight: fontWeight.medium,
      lineHeight: Math.round(fontSize.title.md * lineHeight.tight),
    },
  },
  body: {
    sm: {
      fontSize: fontSize.body.sm,
      fontWeight: fontWeight.regular,
      lineHeight: Math.round(fontSize.body.sm * lineHeight.normal),
    },
    md: {
      fontSize: fontSize.body.md,
      fontWeight: fontWeight.regular,
      lineHeight: Math.round(fontSize.body.md * lineHeight.normal),
    },
  },
  label: {
    sm: {
      fontSize: fontSize.label.sm,
      fontWeight: fontWeight.regular,
      lineHeight: Math.round(fontSize.label.sm * lineHeight.normal),
    },
    md: {
      fontSize: fontSize.label.md,
      fontWeight: fontWeight.regular,
      lineHeight: Math.round(fontSize.label.md * lineHeight.normal),
    },
  },
  weights: fontWeight,
};

// Light mode — neutral cool-gray surfaces, near-black text for contrast.
// All values picked to clear 4.5:1 for body text against bg/surface.
const lightColors: ThemeColors = {
  bg: '#FFFFFF', // pure white screen background
  surface: '#FFFFFF', // cards/sheets share bg in flat-design — separation via hairlines
  surfaceMuted: '#F4F4F3', // alternating rows / pressed state, near-imperceptible warm gray
  text: '#111111', // near-black, ~18:1 against bg
  textMuted: '#5A5A58', // ~6.5:1 against bg, used for metadata
  textFaint: '#8A8A87', // ~3.4:1, only for non-essential labels (small caps "BILLS")
  border: '#E5E5E3', // hairline dividers, low-contrast intentional
  borderStrong: '#111111', // matches text for focused input emphasis
  accent: '#1A1A1A', // near-black accent — distinct from wallet brand colors
  success: '#1F7A3A', // muted green for "paid" confirmations, distinct from Maya's brighter brand green
  warning: '#B86E00', // muted amber for overdue, distinct from UnionBank orange
  danger: '#B3261E', // muted red for destructive actions
};

// Dark mode — placeholders. Structure mirrors light so screens can render
// without conditionals. Real dark palette is deferred to build step 8.
// TODO(step 8): tune all dark values; verify wallet brand colors meet 3:1
// against `bg` and `surface`; adjust borders for visibility on dark surfaces.
const darkColors: ThemeColors = {
  bg: '#0E0E0E',
  surface: '#0E0E0E',
  surfaceMuted: '#1A1A1A',
  text: '#F2F2F0',
  textMuted: '#A8A8A4',
  textFaint: '#6E6E6B',
  border: '#262624',
  borderStrong: '#F2F2F0',
  accent: '#F2F2F0',
  success: '#4CAF6A',
  warning: '#E69500',
  danger: '#E5524B',
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  spacing: space,
  typography,
  radii,
  borderWidth,
  opacity,
  walletBrand,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: darkColors,
  spacing: space,
  typography,
  radii,
  borderWidth,
  opacity,
  walletBrand,
};

export default lightTheme;
