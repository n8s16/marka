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
        <style>{`
          html, body { background-color: #FFFFFF; }
          @media (prefers-color-scheme: dark) {
            html, body { background-color: #1A1A1A; }
          }
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
        `}</style>

        {/* Expo's reset for full-page ScrollViews — must come before
            user styles so layout calc is correct on first paint. */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
