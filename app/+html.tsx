// Custom HTML wrapper for the static web export.
//
// Expo Router uses this file to template every page's <html> envelope. We
// inject:
//   - The PWA manifest link (`/manifest.webmanifest`).
//   - iOS Safari "Add to Home Screen" meta tags (apple-mobile-web-app-*).
//     Without these, iOS won't treat the bookmark as a standalone PWA —
//     it opens in a Safari tab instead of fullscreen.
//   - Theme + viewport meta. Viewport's `viewport-fit=cover` is required
//     so the app draws under the iPhone notch / home indicator when
//     installed standalone.
//
// The manifest, icons, and any `<link>` targets here are served from the
// `/public` folder (`public/manifest.webmanifest`, `public/icon-*.png`).
// Anything in `public/` is copied verbatim to the export root by Expo.
//
// Reference: https://docs.expo.dev/router/reference/static-rendering/#root-html

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* PWA manifest. */}
        <link rel="manifest" href="/manifest.webmanifest" />


        {/* Theme + light/dark color hints. iOS uses theme-color for the
            status bar background when the PWA is launched standalone. */}
        <meta name="theme-color" content="#1A1A1A" />
        <meta name="color-scheme" content="light dark" />

        {/* iOS "Add to Home Screen" — without these, iOS opens the
            bookmark in a Safari tab rather than as a standalone app.
            apple-mobile-web-app-capable replaces Apple's deprecated UA
            sniff for "is this a standalone PWA?" */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Marka" />
        <link rel="apple-touch-icon" href="/icon-1024.png" />

        <title>Marka</title>

        {/* Body background matches the tab bar's surface colour in
            each theme. Without this, the iPhone's home indicator zone
            (the ~34px below the tab bar) renders the browser default
            body colour, which is darker than `theme.colors.surface`
            in dark mode — visible as a black strip. Setting body bg
            to surface makes the tab bar visually extend to the screen
            edge. Light mode bg and surface are both #FFFFFF so no
            contrast issue.

            Phone-shaped centred shell on wide viewports: above 480px
            we cap #root at 480px and centre it horizontally. The body
            background fills the side margins, which on desktop reads
            as a "phone-shaped" preview without us writing any
            tablet/desktop layouts. Mobile (<480px) is unchanged.
            We add a hairline border on each side at >=720px so the
            centred shell visually separates from the surrounding
            chrome on large monitors. */}
        {/* Expo's reset for full-page ScrollViews. Must come before
            our overrides so we can override the parts that need
            adjusting for iOS PWA standalone mode. */}
        <ScrollViewStyleReset />

        <style>{`
          /* Force the document tree to a real viewport height in
             iPhone PWA standalone mode. Expo's reset uses
             \`height: 100%\`, which only works if every ancestor up
             to <html> has a defined height; in some standalone-mode
             render paths this collapses on short content and leaves
             a body-coloured strip below the screen content. \`100dvh\`
             is the dynamic-viewport-height unit — the layout viewport
             excluding any browser chrome — and is the right answer
             on iOS 16+. We pin html, body, and #root to it explicitly. */
          html, body, #root {
            height: 100dvh;
            min-height: 100dvh;
          }
          /* React Native Web stacks Views vertically by default but
             #root from Expo's reset has \`display: flex\` with no
             flex-direction, so it defaults to row. The first child
             (the React tree) gets stretched to height via align-items
             stretch on the cross axis, which IS height in row layout.
             Setting flex-direction: column makes the intent explicit
             and matches how React Native renders natively. */
          #root { flex-direction: column; }

          /* Body background matches the tab bar's surface colour in
             each theme. Without this, the iPhone's home indicator
             zone (the ~34px below the tab bar) renders the browser
             default body colour, which is darker than
             \`theme.colors.surface\` in dark mode — visible as a
             black strip. Setting body bg to surface makes the tab
             bar visually extend to the screen edge. Light mode bg
             and surface are both #FFFFFF so no contrast issue. */
          html, body { background-color: #FFFFFF; }
          @media (prefers-color-scheme: dark) {
            html, body { background-color: #1A1A1A; }
          }

          /* Phone-shaped centred shell on wide viewports: above 480px
             cap #root at 480px and centre it horizontally. The body
             background fills the side margins, which on desktop reads
             as a "phone-shaped" preview without us writing any
             tablet/desktop layouts. Mobile (<480px) is unchanged.
             A hairline border kicks in at >=720px so the centred
             shell visually separates from the surrounding chrome on
             large monitors. */
          @media (min-width: 480px) {
            #root {
              max-width: 480px;
              margin-inline: auto;
            }
          }
          @media (min-width: 720px) {
            #root {
              border-left: 1px solid rgba(0, 0, 0, 0.08);
              border-right: 1px solid rgba(0, 0, 0, 0.08);
            }
          }
          @media (min-width: 720px) and (prefers-color-scheme: dark) {
            #root {
              border-left-color: rgba(255, 255, 255, 0.08);
              border-right-color: rgba(255, 255, 255, 0.08);
            }
          }

          /* Hide the native date / time picker indicator. We open
             the picker programmatically via showPicker() on click +
             focus, and the built-in icon renders as a dark-on-dark
             strip on the right edge in dark mode. Without this, you
             see an empty grey rectangle next to the value. */
          input[type="date"]::-webkit-calendar-picker-indicator,
          input[type="time"]::-webkit-calendar-picker-indicator {
            display: none;
            -webkit-appearance: none;
          }
          input[type="date"],
          input[type="time"] {
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
