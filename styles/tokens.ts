// Theme-agnostic primitives. Anything that varies between light and dark
// belongs in /styles/theme.ts, not here. The only hardcoded colors that live
// here are the wallet brand colors, which are cross-theme constants by design.

import { StyleSheet } from 'react-native';

// Spacing scale — strict 4 / 8 / 12 / 16 / 20 / 24 / 32. No one-off values.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export type SpaceKey = keyof typeof space;

// Border radii — 8 standard, 12/16 for cards, 9999 for circular.
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  round: 9999,
} as const;

export type RadiiKey = keyof typeof radii;

// Typography scale — two weights only (400 regular, 500 medium).
// Sizes grouped by role: title (screen / section heads), body (default
// reading), label (metadata, small caps muted labels).
export const fontSize = {
  title: { sm: 18, md: 20 },
  body: { sm: 14, md: 16 },
  label: { sm: 11, md: 12 },
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
} as const;

// Sensible defaults for line-height. Use unitless multipliers so they scale
// cleanly with dynamic type at the consumer level.
export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.5,
} as const;

// Wallet brand colors — constant across light and dark. These encode wallet
// identity and must never be substituted with theme colors.
export const walletBrand = {
  maya: '#00B14F',
  gcash: '#007DFE',
  unionbank: '#FF8000',
  cash: '#888780',
  // Fallback for user-added wallets before they pick a color.
  fallback: '#888780',
} as const;

export type WalletBrandKey = keyof typeof walletBrand;

// Hairline borders. RN's StyleSheet.hairlineWidth resolves to ~0.5px on most
// densities, which matches the "0.5px hairline" intent without us hardcoding.
export const borderWidth = {
  hairline: StyleSheet.hairlineWidth,
} as const;

// Opacities. 0.55 is the canonical strikethrough-paid value.
export const opacity = {
  paid: 0.55,
  disabled: 0.4,
  muted: 0.7,
} as const;
