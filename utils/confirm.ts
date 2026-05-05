// Cross-platform confirmation prompt. Drop-in replacement for the
// subset of `Alert.alert` we use across the app.
//
// Why this exists: react-native-web's `Alert.alert` implementation
// is quietly broken for the cancel + destructive pattern we use
// throughout the app (multi-button alerts where one option triggers
// a destructive action via `onPress`). On web it either no-ops or
// fails to fire the destructive callback, so taps on the Wipe / Skip
// / Delete buttons appear to do nothing. Native code paths kept
// `Alert.alert`; now that the app is pure-PWA there's no native
// path, and `window.confirm` is the primitive that always works.
//
// API mirrors `Alert.alert(title, message, buttons)` so call-site
// changes are a one-line swap. Buttons array order matches what the
// codebase already passes:
//   - First button is `{ style: 'cancel' }` (or default)
//   - Second button is the action; its style is usually 'destructive'
//     and the call only matters if its `onPress` fires.
// We map "OK" on `window.confirm` to the action button, "Cancel" to
// the cancel button (which usually has no onPress, so we just drop
// it on the floor).

interface ConfirmButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export function showConfirm(
  title: string,
  message: string,
  buttons: ConfirmButton[] = [],
): void {
  const fullMessage = `${title}\n\n${message}`;
  const accepted = window.confirm(fullMessage);

  if (accepted) {
    const action =
      buttons.find((b) => b.style === 'destructive') ??
      buttons.find((b) => b.style === 'default') ??
      buttons.find((b) => b.style !== 'cancel');
    action?.onPress?.();
  } else {
    const cancel = buttons.find((b) => b.style === 'cancel');
    cancel?.onPress?.();
  }
}

/** Single-message popup, no decision. Mirrors `Alert.alert(title, msg)`. */
export function showAlert(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}
