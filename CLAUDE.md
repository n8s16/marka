# CLAUDE.md

Engineering conventions, subagent architecture, and workflow for the Marka project. Read this in full at the start of every session.

## Read these first, in order

1. **`docs/PRD.md`** — what the app is, why it exists, what's in scope, what's not. The product source of truth.
2. **`docs/DATA_MODEL.md`** — entity shapes, derivation rules, behavioral rules. The data source of truth.
3. **This file** — engineering conventions and how the agents work.

If the PRD and a request seem to conflict, raise the conflict to the user. Don't silently resolve it. The PRD has the answer or needs to be updated; either way, the user decides.

## Tech stack

- **Expo (React Native) with TypeScript** — UI framework, mobile runtime
- **expo-sqlite** — local database
- **Drizzle ORM** — typed schema, migrations, query builder
- **Zustand** — app state (cross-screen)
- **React Navigation / Expo Router** — file-based navigation
- **date-fns** — all date arithmetic
- **expo-notifications** — local notifications for bill reminders
- **expo-local-authentication** — biometrics / PIN for app lock
- **Expo Go** for development; EAS Build for eventual store publishing (out of v1 scope)

Stack rationale: TypeScript has the largest training corpus and produces the most reliable AI-generated code. Expo removes most native-toolchain pain. SQLite + Drizzle gives the user (a backend dev) a typed, schema-first data layer. Local-only for v1 — no backend, no cloud, no API.

### Things to deliberately NOT do

- Do not introduce a backend, server, or cloud database for v1.
- Do not pull in heavyweight state libraries (Redux, MobX). Zustand or built-in React state is enough.
- Do not generalize prematurely (no plugin systems, no abstract data adapters, no "what if we support multiple databases later").
- Do not optimize for scale. Database has hundreds to low-thousands of rows. Indexing concerns beyond `docs/DATA_MODEL.md`'s recommended set are not relevant.
- Do not depend on AsyncStorage or in-memory state for transactional data. Bills, payments, expenses, transfers always go through SQLite.
- Do not silently "fix" things the PRD or DATA_MODEL specifies. If the spec is wrong, raise it. Don't drift.

## Project structure

```
/app                      Expo Router screens
  /(tabs)                 Bottom-nav tab screens
    bills.tsx
    spending.tsx
    wallets.tsx
    insights.tsx
  /onboarding
    pick-wallets.tsx
    add-first-bill.tsx
  /bills/[id].tsx         Bill detail / edit
  /year-grid.tsx          Year overview screen
  /settings/              Settings sub-screens

/components               Reusable UI components
  /wallet-card.tsx
  /bill-row.tsx
  /currency-input.tsx
  ...

/db
  /schema.ts              Drizzle schema (data-modeler owns)
  /migrations/            Drizzle migrations
  /queries/               Typed query helpers grouped by entity
    /bills.ts
    /expenses.ts
    /wallets.ts
    /transfers.ts

/logic                    Pure functions (business-logic-developer owns)
  /forecasts.ts
  /periods.ts
  /aggregations.ts
  /bill-status.ts
  /currency.ts            Parse/format helpers

/state                    Zustand stores
  /selected-month.ts
  /theme.ts
  /app-lock.ts

/styles
  /tokens.ts              Color, spacing, typography tokens
  /theme.ts               Light/dark theme definitions

/utils
  /date.ts                date-fns wrappers
  /uuid.ts                UUID v4 generator
```

## Code conventions

- TypeScript strict mode. No `any` without an explanatory comment naming what's blocking proper typing.
- Files: `kebab-case.ts` and `kebab-case.tsx`.
- Components: `PascalCase`. Hooks: `useCamelCase`. Variables: `camelCase`.
- Functional components only. No class components.
- Pure functions in `/logic` are unit-tested. No exceptions for "trivial" functions — money math is never trivial.
- Currency is always integer minor units (centavos). Never floats. All formatting goes through `formatCurrency` in `/logic/currency.ts`. All parsing goes through `parseCurrencyInput`.
- Dates are always ISO 8601 strings in storage; date-fns for arithmetic; never `new Date()` math by hand.
- IDs are UUID v4 from `/utils/uuid.ts`, generated client-side.
- Every table has `created_at` and `updated_at` managed by Drizzle defaults.
- Soft delete via `archived` flag. Hard delete is a separate confirmed action.
- DB tables: `snake_case`, singular (`wallet` not `wallets`).

## Subagent architecture

Specialized subagents keep contexts focused and prevent cross-domain pollution. The primary agent (you, reading this) is the architect and orchestrator. Delegate implementation work to the agent best suited to the task.

### How to delegate

When a task touches a domain owned by a subagent, invoke that subagent rather than doing the work in the main thread. The main agent's job is:

1. Understand the user's request.
2. Decompose it into subagent-sized tasks.
3. Brief each subagent with the relevant context (specific PRD section, specific DATA_MODEL rule, conventions).
4. Integrate the results.
5. Report back to the user with a clean summary.

Subagents do not call each other directly — coordinate through the main agent so orchestration stays legible to the user.

### Subagent roster

The full system prompts live in `.claude/agents/<n>.md`. Each enforces strong stay-in-your-lane instructions. Brief overview:

- **`data-modeler`** — SQLite schema, Drizzle definitions, migrations, indexes, complex queries.
- **`react-native-developer`** — UI screens, components, navigation, wiring components to data and logic layers.
- **`ui-designer`** — Visual fidelity, color system, typography, spacing, dark mode, accessibility.
- **`business-logic-developer`** — Pure functions in `/logic`: forecasts, periods, aggregations, bill status, currency math.
- **`qa-tester`** — Unit tests for logic, integration tests for data, smoke tests for flows, edge case identification.
- **`devops-engineer`** — Build, dependencies, Expo config, eventual publishing. Largely dormant during early dev.

### Default delegation patterns

| User request | Lead subagent | Supporting |
|---|---|---|
| "Add a new field to bills" | `data-modeler` | `react-native-developer` (form), `business-logic-developer` (if it affects calculations) |
| "Build the Insights screen" | `business-logic-developer` (aggregations first) | `react-native-developer` (UI), `ui-designer` (polish) |
| "The bill row looks off-center" | `ui-designer` | — |
| "Mark-as-paid isn't saving the wallet" | `data-modeler` (verify schema) → `react-native-developer` (form wiring) | `qa-tester` for regression test |
| "How should X work?" (not in PRD) | escalate to user | — |

## Build order

The user wants daily-usable as fast as possible. Don't try to ship all screens at once.

1. **Data layer** — schema, migrations, basic CRUD via typed queries. No UI yet. (`data-modeler`)
2. **Bills tab + Mark-as-paid + Add bill** — the minimum end-to-end loop. After this, the user can replace the bills layer of their spreadsheet. (`data-modeler` → `business-logic-developer` for status/forecasts → `react-native-developer` for UI)
3. **Wallets tab** (outflow only, no balance toggle) — visibility into per-wallet outflow.
4. **Spending tab + quick-add** — the one-off log.
5. **Onboarding** — only after the rest is real.
6. **Insights tab** — aggregations and trends.
7. **Year grid** — preserves spreadsheet view.
8. **Settings polish** — manage wallets/bills/categories, theme picker, export, app lock.
9. **Optional balance toggle** — last, once everything else is solid.

After step 2, the user installs the app and starts using it daily. That's the milestone.

## Workflow notes

- Always verify changes work in Expo Go on device before reporting "done."
- Never auto-update dependencies. The user pins versions intentionally.
- When adding a library, document why in `package.json` comments or near first use, and update this file if it's significant.
- For any schema change, generate a Drizzle migration in the same commit. Never modify schema without a migration.
- Tests live next to code: `forecasts.ts` ↔ `forecasts.test.ts`.
- Commit messages are short and present-tense: "Add Wallet schema," "Fix overdue calculation for quarterly bills."

## When in doubt

- If a decision could go multiple plausible ways and the user hasn't chosen, ask. Don't invent.
- If a request would violate a principle in the PRD or DATA_MODEL, push back and explain before complying.
- If you're writing 200+ lines for a single feature, stop and reconsider.
- The user is a backend dev who values clarity over hand-holding. Skip the explanations they don't need; don't skip the ones they do.

## App identity

- **Name**: Marka
- **Slug**: `marka`
- **Scheme**: `marka` (for deep linking)

`Marka` is Filipino for "mark" — a play on the strikethrough-when-paid mechanic. Pronounced "MAR-ka."
