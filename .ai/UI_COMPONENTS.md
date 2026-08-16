# UI Components

Conventions for building the user interface. This doc covers the rules for turning markup into Svelte components, plus how those components are named and typed. The data shapes these components render are described in `ARCHITECTURE.md` and `CORE.md`.

---

## 1. Rule of Two: component vs raw HTML

- **Write raw HTML only when a snippet is a one-off** — used exactly once, for a single specific layout/location, and has no realistic chance of being reused later.
- **Write a Svelte component whenever a snippet is used at least twice, or could be used in the future.** Err on the side of a component. Reuse beats duplication.

This applies to everything, not just `*.svelte` files:

- **Typography** — headings, body text, labels, code blocks, error/success messages → components (e.g. `Heading.svelte`, `Paragraph.svelte`, `InlineCode.svelte`, `FieldError.svelte`).
- **Icons** — **every icon must be a component.** This is an explicit, hard exception to the Rule of Two: even a single-use icon is extracted, so the set stays consistent and grows predictably (e.g. `CalendarIcon.svelte`, `CheckIcon.svelte`, `SpinnerIcon.svelte`).
- **Layouts** — repeated structural containers such as page shells, centered panes, card grids, sticky headers → components (e.g. `PageHeader.svelte`, `EventCard.svelte`, `EventCardGrid.svelte`).

A snippet that looks like a one-off today frequently becomes a two-off tomorrow; when in doubt, extract.

## 2. Naming: name after the use case, not the abstraction

Name components after **what they do in the domain**, not a generic programmatic label. Prefer concrete, use-case names; avoid abstract names like `List`, `Card`, `Item`, `Wrapper`, `Component`, `Container`.

Good:
- `ParticipantList.svelte` (not `List.svelte`)
- `BestSlotsRankedList.svelte` (not `RankedList.svelte` or `List.svelte`)
- `SyncStatusIndicator.svelte` (not `Badge.svelte` or `StatusIcon.svelte`)
- `HeatmapCell.svelte` (not `Cell.svelte`)
- `AvailabilityLegend.svelte` (not `Legend.svelte`)

Less good but acceptable when genuinely needed as a low-level building block:
- A truly generic icon wrapper with **no domain meaning** may keep a neutral name (e.g. `IconButton.svelte`) — but if the same markup is used for a specific action, name it for the action (e.g. `SubmitButton.svelte`).

The same file-naming rules apply: kebab-case filenames (`best-slots-ranked-list.svelte`), PascalCase component names inside the file.

## 3. Typed props & shared types

- **Every component declares fully typed props** with `interface`/`type` + `let { ... }: Props = $props()`. No implicit `any` props.
- **Never redeclare the same shape.** When two or more components take the same props (e.g. both `FreeAvailabilityOverlay.svelte` and `BusyAvailabilityOverlay.svelte` take an `availabilityBlock`), they import and share the **same type** from a central location.
  - Put shared prop types where the data originates — co-located with the domain type, in `src/lib/types.ts` (or `src/lib/<feature>/types.ts`) — and import them in components.
  - If two component-specific prop shapes overlap, name the shared interface for the concept (`AvailabilityBlock`, `HeatmapSlot`, `ParticipantSummary`), not for a single component, so it isn't tied to one use.
- Type the full contract: `children`/`slot` content, class/style overrides, event callbacks, `disabled` states, and accessibility props (e.g. `aria-label`) where meaningful.

Example:

```svelte
<!-- ParticipantList.svelte -->
<script lang="ts">
  import type { ParticipantSummary } from '$lib/types';

  interface Props {
    participants: ParticipantSummary[];
    emptyText?: string;
    onSelect?: (participant: ParticipantSummary) => void;
  }

  let { participants, emptyText = 'No participants yet', onSelect }: Props = $props();
</script>
```

Note that this is a design decision (`types.ts` for shared domain types) — it lives with the UI source, which is `src/lib/components`, so the shared types belong under `src/lib`.

---

## 4. Structure

Components live in `src/lib/components/`, organized by use case so related pieces sit together:

```
src/lib/components/
├─ Heatmap.svelte
├─ HeatmapCell.svelte
├─ AvailabilityLegend.svelte
├─ ParticipantList.svelte
├─ SleepScheduleForm.svelte
├─ SyncStatusIndicator.svelte
└─ icons/
   ├─ CalendarIcon.svelte
   ├─ CheckIcon.svelte
   └─ SpinnerIcon.svelte
```

The component rule (Rule of Two) cross-references the repo layout in `ARCHITECTURE.md` — extract a component before it would otherwise appear in a second `.svelte` template.