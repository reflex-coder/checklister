# Runner UX Improvements — Design Spec

## Features

### 1. Custom button labels per step

**Problem:** "Yes/No" is wrong for many step types (e.g. "Start screen recording" — "Done" makes more sense than "Yes").

**Solution:** Each step gets two optional string fields: `yes_label` and `no_label`. These default to `"Yes"` / `"No"` if blank.

**Data:** Step schema gains `yes_label?: string` and `no_label?: string`. No DB migration needed (steps are stored as JSON).

**Admin UI:** Each row in the per-step options panel gets two small text inputs inline: `Yes: [____]` `No: [____]`, with placeholder text showing the default. These sit alongside the existing Allow note / Skippable checkboxes.

**Runner UI:** `showStep()` uses `step.yes_label || 'Yes'` and `step.no_label || 'No'` for button text. The stored `answer` value remains `"yes"` / `"no"` so nothing downstream changes.

---

### 2. List mode (runner-chosen)

**Problem:** Some users want to see the full checklist at once and answer in any order rather than one step at a time.

**Solution:** On the name-entry screen, below the name input, add a mode toggle: `Step by step` (default) vs `List view`. The runner's choice controls only their current run — no per-checklist admin setting needed.

**State:** `state.listMode = false` added to the runner state object. Set when the user taps the toggle before starting.

**New screen:** `screen-list` renders all steps as a scrollable list. Each item shows:
- Step text
- Inline yes/no buttons (using custom labels), plus skip button if `skippable`
- A collapsible note textarea if `allow_note`
- Once answered: the chosen button is highlighted, others dimmed; re-clicking a different button updates the answer

**Completion:** A sticky "Complete" button at the bottom, disabled until all steps are answered. Clicking it saves all responses and completes the run (same API call as step mode).

**Saving:** Responses are sent to the server after each answer (same `PUT /api/runs/:id` with full responses array), so a page reload doesn't lose progress.

---

### 3. Bulk toggle controls in admin step options

**Problem:** Setting "Allow note" or "Skippable" for each step individually is tedious when you want to apply the same setting to all steps.

**Solution:** Add a bulk-control bar above the per-step options grid with four small buttons: `All on` / `All off` for Allow note, and `All on` / `All off` for Skippable. Clicking updates all entries in `stepMeta` and re-renders the list.

---

## Files Changed

- `public/index.html` — add `screen-list` div, add mode toggle to `screen-name`
- `public/runner.js` — add `listMode` to state, branch `startRun()`, add `showList()` / list answer logic
- `public/admin.js` — add `yes_label`/`no_label` to stepMeta, update `regenOpts()` for label inputs and bulk controls
- `public/style.css` — add styles for list mode items, mode toggle, bulk control bar
- `routes/checklists.js` — no change needed (labels stored inside steps JSON)

## Out of Scope

- Persisting list-mode preference across runs
- Per-checklist default mode setting in admin
- Changing stored answer values (remain `yes`/`no`/`skip`)
