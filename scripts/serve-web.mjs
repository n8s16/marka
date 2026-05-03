// Static-file server for the web PWA build.
//
// Serves `dist/` (the output of `npx expo export --platform web`) with
// the right MIME types and SPA-style HTML fallback for unknown routes.
// No special CORS / isolation headers needed — the data layer uses
// sql.js + IndexedDB, which works on any modern host without
// cross-origin isolation.
//
// Usage: `npm run web:export && npm run web:serve`. Defaults to
// http://localhost:3000; override with `PORT=4000 npm run web:serve`.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function send404(res, msg = 'Not found') {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(msg);
}

// Walk a list of disk paths and return the first one that resolves to
// a real file. Returns null if none do. We need this because Expo's
// static export can emit BOTH `bills.html` and a sibling `bills/`
// directory (for nested routes like `bills/[id]`), so a naive
// "stat the requested path" approach hits the directory and then
// fails to fall through to `bills.html`.
function firstFile(candidates) {
  for (const candidate of candidates) {
    try {
      const stats = statSync(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

const server = createServer((req, res) => {
  // Strip query string before resolving disk paths.
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const filePath = normalize(join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) return send404(res, 'Forbidden');

  // Resolution order, most-specific first:
  //   1. Exact file match (e.g. `/icon-1024.png` → `dist/icon-1024.png`)
  //   2. `<path>.html` — Expo emits these for top-level routes
  //   3. `<path>/index.html` — for paths that map to a folder index
  //   4. SPA fallback to `dist/index.html` for unknown routes
  // Step 4 means deep links to undocumented client routes still
  // hydrate via the JS bundle, matching SPA expectations.
  const hasExt = !!extname(filePath);
  const candidates = hasExt
    ? [filePath]
    : [
        filePath,
        `${filePath}.html`,
        join(filePath, 'index.html'),
        join(ROOT, 'index.html'),
      ];

  const resolved = firstFile(candidates);
  if (!resolved) return send404(res);

  res.statusCode = 200;
  res.setHeader(
    'Content-Type',
    MIME[extname(resolved)] ?? 'application/octet-stream',
  );
  createReadStream(resolved).pipe(res);
});

// Default to localhost-only. Set HOST=0.0.0.0 to allow LAN devices
// (e.g. a phone on the same Wi-Fi) to reach the server for testing.
const HOST = process.env.HOST ?? '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`marka PWA → http://${HOST === '0.0.0.0' ? '0.0.0.0' : 'localhost'}:${PORT}`);
  console.log(`serving ${ROOT}`);
});
