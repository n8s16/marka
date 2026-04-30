# Marka

Personal expense and bill tracker for a single user. Local-only for v1, no backend.

See `docs/PRD.md` for the product spec, `docs/DATA_MODEL.md` for the data
model, and `CLAUDE.md` for engineering conventions.

## Requirements

- Node 20+ (tested with Node 24)
- npm 10+
- Expo Go on the iOS or Android device you want to develop against

## Getting started

```bash
npm install
npm run dev
```

Then scan the QR code from Expo Go.

## Scripts

- `npm run dev` — start Metro and the Expo dev server
- `npm run dev:ios` — start and open the iOS simulator (macOS only)
- `npm run dev:android` — start and open an Android emulator
- `npm test` — run the Jest test suite once
- `npm run test:watch` — run Jest in watch mode
- `npm run lint` — ESLint via the Expo config
- `npm run typecheck` — TypeScript with `--noEmit`
- `npm run migrate` — generate a Drizzle migration from `db/schema.ts`

## Project layout

See `CLAUDE.md` "Project structure" for the full directory map. Most empty
dirs at scaffold time hold a `.gitkeep` until their owning subagent fills
them in.
