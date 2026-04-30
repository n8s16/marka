// Wallet brand-color resolution.
//
// The four canonical PH wallets — Maya, GCash, UnionBank, Cash — share a
// constant brand color across light and dark themes (see styles/tokens.ts
// `walletBrand`). Custom user wallets fall back to the wallet's stored hex
// `color`. This helper centralizes the name→key lookup so it isn't duplicated
// between bill-row, wallet-picker, and any future wallet-tinted UI.

import type { Wallet } from '@/db/queries/wallets';
import { walletBrand, type WalletBrandKey } from '@/styles/tokens';

/**
 * Returns the brand key for a wallet whose `name` matches one of the four
 * canonical PH wallets (case-insensitive), else null. Custom wallets always
 * return null so callers fall through to `wallet.color`.
 */
export function brandKeyForWalletName(name: string): WalletBrandKey | null {
  const norm = name.trim().toLowerCase();
  if (norm === 'maya') return 'maya';
  if (norm === 'gcash') return 'gcash';
  if (norm === 'unionbank') return 'unionbank';
  if (norm === 'cash') return 'cash';
  return null;
}

/**
 * Resolve the accent color for a wallet — brand color when canonical, the
 * stored hex otherwise. Returns null when no wallet is provided so callers can
 * conditionally render an accent border / dot.
 */
export function accentColorFor(wallet: Wallet | undefined | null): string | null {
  if (!wallet) return null;
  const key = brandKeyForWalletName(wallet.name);
  if (key) return walletBrand[key];
  return wallet.color;
}
