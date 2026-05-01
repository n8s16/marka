# Marka — Decision Log

This document captures the *why* behind the decisions in `PRD.md` and `DATA_MODEL.md`. Those documents tell you what was decided; this one tells you why, so future-you (or future-Claude) doesn't re-derive the reasoning from scratch — or worse, second-guess a sound decision and undo it.

Decisions are listed in roughly the order they were made. Each entry has the question, the choice, the reasoning, and what we considered and rejected.

---

## 1. Mental model: three layers of money movement

**Question:** How should the app organize transactions conceptually?

**Decision:** Three layers — recurring bills, one-off spending, and wallets — each with distinct UX. A fourth surface (Insights) derives summaries from the first three.

**Why:** Most expense apps treat all transactions equally and force users into category-only thinking. The user's actual mental model — visible in their spreadsheet — separates predictable obligations (bills) from unpredictable purchases (one-offs). Forcing these into one flat list erases a useful distinction. Wallets get their own surface because the user already tracks "which wallet paid which bill" via cell color in their spreadsheet — it's a load-bearing concept, not a footnote.

**Considered and rejected:** A single transactions table with a `type` field. Cleaner database, dirtier UX. Every screen would have to filter by type anyway, so the apparent simplification doesn't pay off.

---

## 2. Local-first, no backend

**Question:** Should the app sync to a cloud backend?

**Decision:** Local-first with SQLite. No backend, no API, no required cloud account for v1.

**Why:** The user is the only user for v1. A backend adds operational cost, latency, attack surface, and complexity for zero benefit. Backups happen via OS-level device backup (iCloud / Google Drive). When the app eventually goes multi-user, sync can be layered on without rewriting the data layer.

**Considered and rejected:** Supabase + auth from day one. Tempting because it future-proofs sharing — but it's premature, and "future-proof now" is usually a way to spend effort solving problems you don't have yet. The data model's UUIDs and event-based design already make later sync feasible.

---

## 3. Outflow-primary, balance-optional

**Question:** Should the Wallets tab show current balance per wallet?

**Decision:** Default view shows "out this month" only. Balance tracking is opt-in per wallet via `show_balance` flag, with `opening_balance` set when first enabled.

**Why:** The app cannot reliably track balance without seeing every transaction the bank/wallet processes — interest credits, refunds, untracked transfers, the random ₱20 someone GCash'd you. Showing a balance the app can't keep accurate creates ongoing user friction (constantly reconciling) and erodes trust. Outflow, by contrast, is a number the app *can* be authoritative about: it's the sum of what the user has logged. Better to be honest about what we know than to fake what we don't.

The user's existing spreadsheet doesn't track balances either — it tracks payments. The app should follow that mental model.

**Considered and rejected:** Always-visible balance with opening-balance prompt during onboarding. Adds onboarding friction and creates an ongoing maintenance burden. The opt-in toggle preserves the option for users who genuinely want it without imposing on those who don't.

---

## 4. Events not states

**Question:** Should derived values like wallet balance and monthly totals be stored?

**Decision:** All derived values are computed from event records, never stored. The only intentional state is `Wallet.opening_balance`, set when balance tracking is enabled.

**Why:** Storing computed totals as columns means they can drift out of sync the moment a user edits, deletes, or restores a transaction. Reconstruction becomes detective work. Computing on the fly is cheap (database has hundreds to low-thousands of rows for years) and correct by construction. This is how every serious financial system works, from bank ledgers to accounting software — for good reason.

**Considered and rejected:** Caching computed totals for performance. Premature optimization. At the data scale this app will see, recomputation is imperceptible.

---

## 5. Archive, don't delete

**Question:** What happens to a wallet (or bill, or category) when the user "removes" it?

**Decision:** All reference entities use an `archived` flag. Hard delete is a separate, explicit, confirmed action that cascades.

**Why:** Deleting a wallet that has 50 historical transactions either orphans them (dangling foreign keys) or silently destroys them (data loss). Both are bad. Archiving hides the wallet from active pickers while preserving history — exactly what the user wants in 99% of cases. The escape hatch (hard delete with explicit confirmation) covers the rare case where someone genuinely wants the data gone.

**Considered and rejected:** Soft delete via `deleted_at` timestamp. Same idea, different field name, but `archived` reads better in code and the UI ("archived bills" is clearer than "deleted bills"). No conceptual difference.

---

## 6. Wallet brand colors as visual identity

**Question:** How should the user distinguish "where did this money come from?"

**Decision:** Each wallet has a brand color used consistently across the app — Maya green, GCash blue, UnionBank orange, Cash gray, plus custom colors for added wallets.

**Why:** The user's spreadsheet already encodes payment source as cell color (green = Maya). It's an instinctive visual cue that works without reading. The app preserves and extends this with proper brand colors, used as left-accent borders, color dots, and tinted year-grid cells. Color answers "where from?" at a glance, before any text is read.

The default colors match each provider's actual brand identity. This is intentional — when the user thinks "GCash," they think blue, because that's what GCash itself uses. Brand colors are not arbitrary; they're cognitive shortcuts.

**Considered and rejected:** A theme-managed neutral palette where wallets all use shades of gray. Cleaner-looking but loses the most useful piece of information at a glance. Brand colors introduce visual noise but earn it.

---

## 7. Strikethrough + opacity for paid bills

**Question:** How should paid bills look different from unpaid ones?

**Decision:** Paid bill rows get strikethrough text and reduced opacity (~0.55). Unpaid rows are at full opacity with normal text.

**Why:** This mirrors the user's spreadsheet convention exactly — they already strike through paid items. The app should follow load-bearing user habits, not impose new ones. Strikethrough also reinforces "paid" beyond just dimming, which matters for accessibility (don't rely on color/opacity alone).

**Considered and rejected:** Checkmark icons. Cleaner-looking in some apps but doesn't match the user's existing mental model. Strikethrough wins because it's already the user's language for "done."

---

## 8. Minimal onboarding

**Question:** How much setup before the user is in the app?

**Decision:** Two steps — pick wallets (defaults pre-checked), add first bill (skippable). No accounts, no email, no balance prompts. Target: under 30 seconds.

**Why:** Onboarding is where most apps lose users. Every screen between "I opened the app" and "I'm using it" is friction. The two steps included are the minimum required for the app to be functional — you need at least one wallet to assign payments to, and the first bill is the entry point to the app's main loop. Everything else (categories, theme, balance tracking, app lock) is discoverable later in Settings.

Pre-checking the four common PH wallets (Maya, GCash, UnionBank, Cash) means most users tap "Continue" without modifying anything — a 3-second decision instead of a 30-second one.

**Considered and rejected:** A welcome tour of the four tabs. People learn apps by using them, not by reading explainers. The first-run tooltip on the Bills screen ("Tap when paid") is the single in-context hint that earns its place.

---

## 9. No partial payments, no installments, no credit cards in v1

**Question:** Should the app handle partial bill payments, installment plans, or credit card usage?

**Decision:** None of these in v1. Bills are paid in full from e-wallets, banks, or cash.

**Why:** The user confirmed they don't deal with these scenarios in their actual finances. Adding support for cases that don't happen creates complexity tax — every screen has to handle "is this fully paid, partially paid, or unpaid?" tri-state, every aggregation has to know about credit-card balances vs spent amounts, etc. The simpler model serves the user 100% of the time at zero cost.

If usage changes later (the user gets a credit card, takes an installment plan), the data model is structured to extend — Bill could gain start/end dates for installments, a new wallet `type` could be added for credit cards. Adding it later is cheaper than carrying it forever.

**Considered and rejected:** "What if it's needed someday?" thinking. Build for known needs, not speculative ones. The data model's extensibility is the insurance policy; we don't need to claim it preemptively.

---

## 10. Subscriptions are Bills

**Question:** Should subscriptions (Spotify, Netflix, iCloud) live in the Bills tab or get their own concept?

**Decision:** Subscriptions are Bills. Same tab, same data model, same UI.

**Why:** Structurally, a subscription *is* a recurring obligation with a predictable amount and due day — that's a bill. Separating them would mean duplicating most of the Bill model and UI for no functional difference. The "subscription auditor" insight some apps offer (surfacing forgotten subscriptions) can be done within the Bills model — it's a filtered view, not a new concept.

If the user ever wants to visually group bills (Subscriptions / Utilities / Insurance), that's a Bill-level category field — additive, not a separate entity.

**Considered and rejected:** A separate Subscriptions tab with logos, free-trial countdowns, cancel buttons. Cool, but expensive to build and not what the user asked for. The Bills tab serves the same need.

---

## 11. Flexible date entry with soft warning

**Question:** Should the app restrict how far in the past a transaction can be dated?

**Decision:** Any date allowed. A small dismissible notice appears when logging a transaction more than 30 days in the past.

**Why:** Restricting dates would block legitimate use cases — backfilling spreadsheet history, logging a forgotten transaction, recording a bill paid weeks ago. Blocking is too aggressive. But fully silent acceptance lets typos slip through ("April 12" when meant "May 12"). A soft warning catches mistakes without blocking — the user dismisses it in one tap if they meant it.

**Considered and rejected:** A 90-day hard restriction. Would have made initial spreadsheet backfilling annoying.

---

## 12. Manual backfill only, no CSV import

**Question:** How should the user move their spreadsheet history into the app?

**Decision:** Manual entry, one record at a time, when they have time.

**Why:** A CSV import sounds appealing but is real implementation work — parser, mapping UI, error handling for malformed rows, validation. For ~20 historical bill payments (5 bills × 4 months), manual entry is 15 minutes. The CSV import would take days to build and would only get used once.

If the app eventually supports multiple users, *then* CSV import becomes valuable (different users will have different historical data, none of which can be hand-entered for them). But that's a v2+ concern.

**Considered and rejected:** Building CSV import "while we're at it." Classic scope creep. The 15-minute manual entry is the better use of time for both the user and the codebase.

---

## 13. Per-bill reminder time, auto-cancel on payment

**Question:** When should bill reminders fire, and what happens if the user pays before the reminder?

**Decision:** Each bill has its own reminder time-of-day (in addition to days-before-due offset). When a bill is marked paid, all pending reminders for that bill+period are cancelled. The next period's reminder is scheduled fresh.

**Why:** Different bills suit different times. Internet bill at 8am alongside the morning routine; a credit card bill at 7pm when the user's at a laptop. Per-bill timing accommodates different rhythms without forcing a single global compromise. Auto-cancel on payment is non-negotiable — a reminder that fires after you've already paid the bill is the worst possible UX, signaling "this app isn't paying attention."

**Considered and rejected:** A single global reminder time. Simpler but less useful. Per-bill timing is one extra field per bill — small cost, real benefit.

---

## 14. Dual backup: OS auto-backup + manual export

**Question:** How does the user protect against losing all their data?

**Decision:** Two layers — OS-level automatic backup (iCloud on iOS, Google Drive on Android) plus manual export to JSON or CSV from Settings.

**Why:** Auto-backup is invisible and zero-effort — the SQLite file lives in a backed-up directory and gets included in the user's regular phone backups. This handles the "phone died" case without any user action.

Manual export handles a different failure mode: wanting the data outside any platform's ecosystem. Useful if the user ever switches platforms, wants to migrate to a different app, or just wants a portable archive in their personal cloud. The two layers protect against different risks.

**Considered and rejected:** Cloud sync to a custom backend. Solves the same problem but with much higher cost (auth, infrastructure, ongoing maintenance). The OS handles backup well enough that we don't need to reinvent it.

---

## 15. Currency: integer centavos, two-decimal display, optional centavo input

**Question:** How is currency stored, displayed, and entered?

**Decision:** Stored as integer minor units (centavos). Displayed always with two decimals and comma separators (`₱1,599.00`). Input accepts whole numbers (interpreted as `.00`) or decimals up to two places.

**Why:** Float math on money is a known footgun — `0.1 + 0.2 = 0.30000000000000004`. Integer storage eliminates this entire class of bug. Two decimals on display is a financial-app convention; users expect it. Optional centavo input matches reality — most PH bills are whole pesos, but groceries and utilities can have centavos. Forcing `.00` on every entry would be tedious; rejecting centavos entirely would lose accuracy.

**Considered and rejected:** Storing as decimal/float strings. Works but invites accidental float math somewhere down the line. Integer minor units is the rigorous answer.

---

## 16. Period defaults to bill's due-month, user-editable

**Question:** When a bill is marked paid, which period (month/quarter/year column) does the payment cover?

**Decision:** Period defaults to the bill's expected due-month, calculated from frequency and due_day. The default smartly picks the nearest unpaid period if the user is paying late. Editable on the mark-as-paid sheet via a dropdown.

**Why:** This preserves the user's spreadsheet model — Converge for April lives in April's column, even if paid on May 2nd. The year grid stays clean and consistent. The smart default handles the common case (user pays on time, or slightly late, for the obvious period). The dropdown is the escape hatch for edge cases (paying ahead, paying for a specific past period).

The distinction between `paid_date` (when the payment cleared) and `period` (which obligation it covers) is one of those subtle data-model choices that pays off everywhere — the year grid, bill status, "unpaid" detection, all become straightforward.

**Considered and rejected:** Period = month of paid_date. Simpler but breaks the year-grid metaphor when payments are late. The complexity is worth it.

---

## 17. App name: Marka

**Question:** What should the app be called?

**Decision:** Marka. Filipino for "mark" — referencing the strikethrough-when-paid mechanic.

**Why:** The name encodes the verb the user does most often (marking bills as paid). Two syllables, easy to say, fits an icon label. PH-rooted without being on-the-nose. Distinctive enough to be searchable, generic enough not to feel branded-into-a-corner.

**Considered and rejected:** Tally (good but generic), Bayad (too on-the-nose), Due (too short to be memorable).

---

## 18. Theme: Light / Dark / System, defaults to System

**Question:** How is light vs. dark theme handled?

**Decision:** A picker in Settings → Preferences → Theme with three options. Defaults to System (follows phone setting and reacts to changes mid-session).

**Why:** Following the system theme is the modern default and what most users prefer. The override exists for users with strong preferences, and is cheap to implement once dark mode is supported anyway (which it must be, for accessibility).

**Considered and rejected:** Locking the app to a single theme. Saves a small amount of work but is increasingly out of step with platform expectations.

---

## 19. App lock: optional, off by default

**Question:** Should the app require biometric/PIN authentication on open?

**Decision:** Available in Settings, off by default. Uses platform biometrics (Face ID, Touch ID, fingerprint) with PIN fallback.

**Why:** The phone's own lock already protects against the common threat (someone picks up your phone). An app-level lock on top is useful for specific scenarios — handing the phone to someone to show them a photo, sharing the device with a partner, etc. — but as a default it adds friction every time you open the app.

The pragmatic middle ground: off by default, available to enable. The verify-biometrics-before-committing-the-toggle detail prevents the bad UX of "I turned on app lock but my biometrics aren't actually set up, now I can't get back in."

**Considered and rejected:** Auto-lock after idle time (e.g. lock again after 5 minutes in the background). Useful but adds complexity. Skipped for v1.

---

## 20. Documentation split: PRD / DATA_MODEL / CLAUDE

**Question:** How should project documentation be organized?

**Decision:** Three files — `docs/PRD.md` for product, `docs/DATA_MODEL.md` for data, `CLAUDE.md` at root for engineering and agent orchestration. Subagent definitions in `.claude/agents/`.

**Why:** Different documents serve different audiences and have different lifecycles. The PRD is what you reference for "is this in scope?" The data model is the most stable and most-cross-referenced. The engineering doc is what subagents work from operationally. Combining them creates one large file that's harder to scan and harder to edit cleanly.

`CLAUDE.md` stays at the root because Claude Code looks for it there by convention. `.claude/agents/` is also at root for the same reason. Documentation that isn't load-bearing for tooling (the PRD, data model, this decision log) lives in `docs/` to keep the root clean.

**Considered and rejected:** A single combined file. Works for small projects but already feels stretched at the size we're at; will only get worse as the app evolves.

---

## 21. `due_day` clamps to the last day of short months

**Question:** What happens when a bill has `due_day = 31` in months with fewer days (Feb, Apr, Jun, Sep, Nov)?

**Decision:** Clamp to the last day of the month. February's due-date for a day-31 bill becomes Feb 28 (or 29 in leap years); April's becomes Apr 30. The bill stays in its expected period.

**Why:** Matches how rent, credit cards, and utilities actually behave — "due on the 31st" colloquially means end-of-month. Rolling the date forward into the next month would shift the bill's period and break the year-grid metaphor: February's column would be empty even though the user paid that month's bill.

**Considered and rejected:** Roll the due-date forward into the next month. Simpler in pure date math, but breaks the period-as-obligation model that the year grid depends on.

---

## 22. Bill anchor via `start_period`

**Question:** For quarterly, yearly, and custom-cadence bills, how does the app know which months are due-months?

**Decision:** Every Bill carries a `start_period` field (`YYYY-MM`) — the first due-month. Subsequent due-months follow from `frequency` (and `interval_months` for custom). For monthly bills, `start_period` defaults to the creation month and is rarely user-visible.

**Why:** Inferring the anchor from `created_at` breaks when the user enters a bill late (creates it in February to track a January payment). Inferring from the first BillPayment leaves the year grid undefined for new bills with no history yet — quarterly forecasts can't render. Explicit beats inferred for something the year grid depends on. The Add-bill form pre-fills `start_period` sensibly so it stays out of the user's way for the common case.

**Considered and rejected:** Anchor from `created_at` (fails on late entry); anchor from first BillPayment (fails for new bills); separate `due_month` field for yearly only (asymmetric — quarterly and custom would need their own anchors too, multiplying fields).

---

## 23. `custom` frequency uses `interval_months`

**Question:** What does `frequency = custom` mean in practice?

**Decision:** When `frequency = custom`, the Bill carries an `interval_months` integer — bi-monthly is `2`, semi-annual is `6`, every-9-months is `9`. Null for the other frequencies. Combined with `start_period` from decision 22, the due-month sequence is fully determined.

**Why:** Most non-standard cadences in real life are "every N months." A single integer covers bi-monthly utilities, semi-annual fees, and similar without UI complexity. The data model can extend later if a real bill needs richer semantics (e.g. arbitrary month list for tax payments in April + October only) — additive, not breaking.

**Considered and rejected:** Drop `custom` from v1 entirely (would require a migration to add later); a list of due-months `["04", "10"]` (more flexible but no current bill needs it).

---

## 24. Tapping a paid bill opens a payment-details sheet, not mark-as-paid

**Question:** What should tapping a row whose current period is already paid do?

**Decision:** Open a separate "Payment details" sheet showing the existing payment with a single "Undo this payment" action. The mark-as-paid sheet only opens when tapping an *unpaid* row. Recording a payment for a different period of the same bill is reachable via the FAB or (later) the year grid. Editing a paid payment in place is intentionally not in v1 — the user undoes and re-marks with corrected values.

**Why:** During milestone testing, the user discovered that tapping a paid bill opened the mark-as-paid sheet, where the smart-default period jumped to the next *unpaid* period. Saving — even after changing the period dropdown — created a NEW BillPayment for that other period, leaving the original paid record intact. From the user's perspective this looked like "edit", but it was actually "additional payment." Two payments on what felt like a single edit is the worst kind of UX failure: silent data corruption.

The data model intentionally allows multiple payments per bill — one per period — because real bills repeat. But the tap-on-row gesture has a strong "edit" connotation. Splitting the two intents into two sheets resolves the mismatch without changing the data layer. The Undo path uses `hardDeleteBillPayment`, which the data layer already exposes; no schema change is needed.

**Considered and rejected:**
- *Status quo + clearer copy on the mark-paid sheet* — a small notice explaining "another payment will be recorded." Cheaper but doesn't fix the mental-model mismatch; a user in a hurry won't read the notice.
- *Read-only receipt with no Undo* — too restrictive. A typo'd amount or wrong wallet becomes uncorrectable, more limiting than the spreadsheet the app replaces.
- *Receipt + Edit + Undo* — the most flexible variant; rejected for v1 because Undo+remark covers every realistic correction scenario at the cost of one extra tap, and edit-in-place can land later (step 10 polish or beyond) without any data-layer change.
- *Disabling tap on paid rows entirely* — the row would have no affordance, which is unintuitive. The receipt sheet earns its keep just by surfacing the paid amount, wallet, date, and note even before any action is taken.

---

## 25. Bill form combines Due Day + First Due Month into a single "First due date"

**Question:** Should the Add / edit bill form expose `due_day` and `start_period` as two fields, or merge them into a single date picker?

**Decision:** Single date picker — "First due date" — that decomposes into the two underlying columns on save. The data model stays unchanged: `due_day` and `start_period` remain separate columns per DECISIONS §22 and §23, because the year-month anchor and the day-of-month each play distinct roles in cadence resolution. Only the form UI is merged.

**Why:** During testing, the user noticed that filling out two adjacent fields ("Due day" and "First due month") felt redundant — and worse, the First Due Month picker exposed a day field whose value was silently dropped, leaving the user unsure which "day" actually applied to the bill. Both observations point at the same root cause: from the user's mental model, a bill is "first due on a date," singular.

Decomposing the picked date back into `(due_day, start_period)` is mechanical: the day-of-month becomes `due_day`, the year-month becomes `start_period`. Helper text on the form notes that to set an end-of-month bill (`due_day = 31` with last-day-of-month clamping), the user picks a 31-day month for the first due date.

**Considered and rejected:**
- *Two fields, sharper helper text* — explained why the day in First Due Month doesn't matter. Doesn't address the bigger redundancy and still leaves users confused on first encounter.
- *Three-piece combined widget* — separate spinners for year, month, and day inside one field. Uglier than the current native date picker, no real win.
- *Edit-mode preservation of `due_day = 31`* — when loading a bill where the original `due_day` clamped down (e.g. `due_day = 31`, `start_period = 2026-02` displays as Feb 28), preserve `due_day = 31` if the user doesn't touch the day. Considered, deemed too implicit. The simpler rule — "the picked day is the due day" — is easier to reason about and the edge case (someone wants `due_day = 31` while starting in a non-31-day month) is rare. Future-Claude can reintroduce preservation if real use surfaces a need.

---

## 26. Transfer history lives on its own screen, not on Wallets or Spending

**Question:** Where does the user view (and edit / undo) transfers after recording them?

**Decision:** A dedicated **Transfers history screen** (route `/transfers`) reachable via a "View transfers" link on the Wallets tab. Lists all transfers across all time, grouped by date desc, tap to edit. Transfers do not appear on the Spending tab or in any Wallets-tab outflow surface.

**Why:** When step 6 shipped the transfer creation flow, transfers were write-only — there was no UI path to read, edit, or delete them after creation. That's worse than not having transfers at all (data is captured but unreachable). Three places it could go:

1. **Recent-transfers section on the Wallets tab** — most discoverable since Wallets is also where users record transfers, but mixes a per-wallet outflow surface with a separate-concept data list.
2. **A dedicated Transfers screen reachable from Wallets** — clean separation of concerns; matches the Spending tab's "list-of-events" pattern; one extra tap (Wallets → "View transfers") doesn't matter for an infrequent operation.
3. **Per-wallet detail screen** — drill in to a wallet card to see its in/out transfers + outflow events. Most context-rich but a much bigger build, and out of MVP scope.

Option 2 won. Cheap, doesn't muddle the Wallets tab's "out this month" framing, mirrors the Spending tab's existing pattern. The link sits next to "Record a transfer" so users find it where they expect.

The transfers list is **all-time** (not current-month). Transfers are infrequent enough that a current-month filter would frequently show empty, and an all-time list scrolls fine until volumes get large. A future date filter can be added if real use surfaces a need.

**Considered and rejected:**
- *Recent-transfers section on Wallets tab* — see option 1 above. Discoverability win, but the Wallets tab is currently focused and clean; mixing concepts erodes that.
- *Per-wallet detail screen* — see option 3. Too big for v1.
- *Showing transfers in the Spending tab* — explicitly conflicts with the data model's "Transfers are NOT spending" critical rule. Even with a visual separator, it would set up the wrong mental model.
- *Current-month-only transfers list* — would frequently render empty for users who don't transfer often. The all-time list is simpler and more useful at this volume.

---

## How to use this document

When making future decisions:

1. **Before relitigating a decision listed here, read the entry.** If the reasoning still applies, don't redo it. If circumstances have genuinely changed, update the entry rather than silently overriding it.
2. **When adding new decisions**, append them in chronological order. Use the same format: question, decision, why, considered-and-rejected.
3. **Don't delete entries.** Even reversed decisions are useful as historical record. Mark them as superseded with a note pointing to the new entry.

This document is for humans (mostly future-you) and for AI agents working on the project. Both benefit from explicit reasoning over inferred reasoning.
