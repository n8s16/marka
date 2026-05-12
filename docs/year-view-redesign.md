# Feature — Year view redesign

**Status:** drafting
**Summary:** Replace the v1 horizontal-scroll year grid with a mobile-friendly vertical stack of months. Each month shows as a collapsed row by default with a slim wallet-colored date strip; tapping a month expands it to reveal its bills with a fuller calendar visualization. Year switcher (‹ 2026 ›) at the top.
**Owner:** Personal (single-user app)
**Supersedes:** v1 "Year grid" screen described in `docs/PRD.md`

## Problem

The v1 year view was a horizontal-scroll grid (months as columns, bills as rows) — a faithful port of the user's spreadsheet, but one that doesn't fit mobile:

- Phones can't show 12 columns at once, so the grid degenerates into horizontal scrolling — an unnatural gesture on mobile, and one that breaks the "scan the whole year at a glance" promise that made the original spreadsheet useful.
- The grid optimizes for cross-month comparison ("how did MP2 do across the year?") rather than month-level scanning ("how did April go?"), which is the actual question the user asks 95% of the time.
- Future-year navigation didn't exist. Once the user has multiple years of data, the v1 design has no way to access prior years.

Mobile-native expense apps that handle this well use either a swipeable single-month calendar or a vertically-scrolling month list. The user picked the vertically-scrolling list (hybrid form, with light calendar visualization per month).

## Decision

Vertical stack of month rows, scrollable. Current month is expanded by default; all others are collapsed single-line rows showing month name, a slim wallet-color-coded date strip summarizing the month, total paid, and paid/unpaid count. Tapping a row expands that month inline; the expansion shows a fuller calendar strip across the month's days plus the bill list (same UI conventions as the Bills tab — strikethrough, wallet color dot, etc.).

A year switcher at the top (`‹ 2026 ›`) lets the user navigate to other years. Arrows fade when there's no data in that direction (no `‹` if there's no 2025 data; no `›` until 2027 starts).

Section labels like "FEB" / "MAR" above each row are removed (redundant with the month name in the row itself). The "this month" indicator becomes a small inline pill next to the current month's name within its expanded card.

## Design

### Three states (final wireframes)

The full wireframe set produced in design has three states:

1. **Default view (current year)** — Year switcher at top → year summary card → list of months. The current month is expanded inline at its chronological position with bill list and detailed day strip; other months are collapsed rows. Future months in the current year render in greyed text with a placeholder strip (no data yet).

2. **Expanded past month** — Tapping a collapsed row replaces it with the same expanded-card treatment as the current month, with no "this month" pill. The expanded card is inline at the row's position — the rest of the list flows around it. Tapping the expanded card's header collapses it back.

3. **Past year (2025)** — Same layout, opens scrolled to the latest available month (December if the year is complete). Year summary card says "Total for 2025" with "year complete" subtitle instead of "Year so far." No month is expanded by default in a past year; the user taps to expand whichever month interests them.

The wireframes themselves live in [`docs/wireframes/year-view-v3.png`](wireframes/year-view-v3.png).

### The date strip

The slim strip below each month's name shows where bills fell that month, color-coded by wallet:

- **Collapsed rows** — 5-6 equal-width segments, each one colored by the wallet of the bill in that approximate week of the month. Coarse on purpose; it's an at-a-glance summary, not a precise calendar.
- **Expanded month** — fuller version, CSS grid of 30 or 31 columns matching the days of the month. Bill positions are placed at their actual `due_day`. Paid bills render in their wallet's color at ~55% alpha; unpaid future bills render with a dashed border and no fill; overdue bills render with a warning-color dashed border and a faint warning fill.

The strip is informational and visual; it's not directly interactive. Tapping the row (any part of it) is what expands/collapses the month.

### Year summary card

Sits below the year switcher and above the month list. Content varies by context:

- **Current year:** "Year so far" + total paid YTD + "X of Y bills · ₱Z upcoming"
- **Past year:** "Total for 2025" + total paid + "X of Y bills · year complete"
- **Future year (if ever applicable):** Probably not reachable in v1.1; if it becomes possible, treat as "Forecast for 2027" with projected totals.

### The "this month" pill

A small rounded badge (8px font, secondary background) sits inline next to the current month's name inside its expanded card. Only renders for the actual current calendar month, and only when viewing the current year. Absent everywhere else.

### Interaction details

- **Tapping a collapsed row:** expands it inline. The current month (if expanded) collapses simultaneously? **Open question** — see below.
- **Tapping an expanded month's header:** collapses it. The current month, if collapsed by user action, re-expands when the user navigates away and returns.
- **Tapping `‹` or `›`:** switches year. The view resets scroll position — current year scrolls to current month; past years scroll to most recent month with data.
- **Faded arrows:** are non-interactive (no tap response). Stay visible to indicate "this is the boundary."

## Data model implications

None. The year view is a pure presentation layer over existing data:

- `Bill` records define what bills exist and their `due_day` / `frequency`
- `BillPayment` records (joined by `bill_id` and `period`) populate paid/unpaid state and amounts
- `Wallet.color` drives the date strip colors

No schema changes, no migrations, no new fields required. The feature is implementable entirely in `/logic` (aggregation per month) and `/app` (the screen itself).

## Behavioral rules

These extend the rules already in `docs/DATA_MODEL.md`.

### Month row summary derivation

For each month in the displayed year:

```
total_paid       = sum(BillPayment.amount where period = "YYYY-MM")
paid_count       = count(BillPayment where period = "YYYY-MM")
total_bills_due  = count(Bill where bill is due in "YYYY-MM" per frequency/due_day)
upcoming_amount  = sum(forecasted amounts for unpaid bills due in "YYYY-MM")
```

Display "X of Y paid" using `paid_count` and `total_bills_due`. "₱Z upcoming" only shows when `upcoming_amount > 0` and the period is current or future.

### Date strip cell resolution (expanded month)

For each day `d` of the month, check for bills with `due_day = d`:

```
no bills due that day:
  → empty cell (no render)
bill due, payment exists:
  → fill with payment.wallet.color at 55% alpha
bill due, no payment yet, day is in the past or today:
  → if overdue: dashed border in warning color + faint warning background
  → if today and within reminder window: same as overdue
bill due, no payment yet, day is in the future:
  → dashed border in secondary border color, no fill
```

Multiple bills on the same day: stack vertically? Use the most recent? **Open question** — see below.

### Year switcher behavior

The switcher fades navigation in directions with no data:

```
fade_left  = (current_displayed_year == earliest_year_with_data)
fade_right = (current_displayed_year == current_calendar_year)
```

Faded arrows are visible but inert. This communicates "you've reached the edge" without removing the visual symmetry.

### Default month expansion

- **Viewing current year:** the current calendar month is expanded; all others collapsed.
- **Viewing past year:** no month is expanded by default. The user taps to expand.
- **Viewing future year (theoretical):** no month is expanded by default.

This rule supports the user's most common task (check on this month) while keeping past-year views purely browsing.

## Out of scope

- **Day-level interaction.** Tapping a date strip cell does not drill into a "day detail" view in v1.1. The bill list within the expanded month is the interactive surface.
- **Cross-year aggregations** ("compare 2025 to 2026"). The Insights tab is the place for that, not the year view.
- **Search or filtering** within the year view. The Bills tab handles search.
- **A traditional calendar grid view** (7×5 weeks like Google Calendar). The vertical list is the primary visualization; a future feature could add an optional grid view per month if needed.
- **Year-level visualizations** (charts of monthly totals across the year). Belongs in Insights.

## Open questions

1. **When the user expands a past month, does the current month auto-collapse?** Two reasonable options:
   - *Yes*: only one month expanded at a time. Cleaner visual, but tapping past months collapses the "you are here" anchor.
   - *No*: multiple months can be open. More flexible, but the screen gets long with many expanded sections.

   *Recommendation:* No — let multiple expand. The current month stays expanded as the anchor; if the user wants to collapse it explicitly they can, but tapping a past month shouldn't take their anchor away.

2. **Multiple bills due on the same day.** When two bills share a `due_day`, how does the date strip render?
   - *Option A:* Vertically stack two thinner bars in the same column.
   - *Option B:* Show only the more recently-paid (or first by ID) and dim or hide the other.
   - *Option C:* Render a small "+1" or dot indicator next to the cell.

   *Recommendation:* Option A — stack thinner bars. Honest about reality, doesn't lose information. Cells with 3+ bills could fall back to a generic neutral fill.

3. **Backfilled months on a fresh install.** A user who installs Marka in April 2026 won't have data for Jan–Mar. Should those months render as empty rows ("No bills tracked"), or be hidden entirely?

   *Recommendation:* Render as empty greyed rows with the month name, a flat grey strip, and "—". Hiding them would make the year view feel "wrong-sized" and arbitrary; rendering them invites the user to backfill.

4. **First time viewing the year view.** Worth a one-time tooltip ("Tap a month to see details") or just discoverable?

   *Recommendation:* Discoverable. The current-month-already-expanded state implicitly demonstrates what an expanded month looks like, so the user can infer the interaction.

## Implementation notes

- The year view becomes the *default* screen when the user taps "Year view" from the Bills tab (existing v1 affordance).
- The same screen file (`/app/year-view.tsx` or similar) handles all three states (current year, past year, expanded month). State lives in a Zustand store: `displayed_year`, `expanded_months` (an array of `"YYYY-MM"` strings).
- The date strip is a small reusable component (`<MonthStrip>`) used in both collapsed and expanded forms with different density.
- Month-row aggregations belong in `/logic/year-view.ts` as pure functions; the screen calls them with raw `Bill[]` and `BillPayment[]` arrays loaded once per year.
- Year switching should feel snappy; preload the displayed year's data into a Zustand store rather than re-querying on every tap.

## References

- `docs/PRD.md` — Bills tab and year view (v1 baseline being replaced)
- `docs/DATA_MODEL.md` — Bill, BillPayment, Wallet schemas and derivation rules
- `docs/DECISIONS.md` — Decisions 5 (archive-don't-delete), 6 (wallet brand colors), 7 (strikethrough), 16 (period vs paid_date) all apply
- [`docs/wireframes/year-view-v3.png`](wireframes/year-view-v3.png) — final wireframe set
