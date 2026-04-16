# Checklister — Design Spec v1.0
**Date:** 2026-04-16

## Overview

A lightweight web app for creating and running step-by-step checklists. An admin authors checklists; anyone with the URL can run them. Each run is logged and triggers Slack/email notifications. The primary motivation: replace Google Docs checklists that have too much friction to actually be used. Mobile-first, bookmark-friendly.

---

## Architecture

**Stack:** Node.js + Express + SQLite, deployed to Railway.

- Single repository, single deployment, single platform
- Express serves both the API and the static frontend (plain HTML/JS, no build step)
- SQLite on disk for all persistence; Railway volume keeps data across deploys
- Email via Nodemailer (configurable SMTP — Gmail, SendGrid, etc.)
- Slack via incoming webhook POST from the server (no secrets in the browser)

**Deployment target:** Railway (free tier sufficient for this scale)

---

## Data Model

### `checklists`
| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Displayed on home screen |
| description | TEXT | Optional subtitle on home screen |
| steps | JSON | Array of step objects (see below) |
| slack_webhook_url | TEXT | Optional; per-checklist |
| notification_email | TEXT | Optional; per-checklist |
| created_at | DATETIME | |
| updated_at | DATETIME | |

**Step object:**
```json
{
  "id": "uuid",
  "text": "Step prompt shown to the runner",
  "allow_note": false,
  "skippable": false
}
```

### `runs`
| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| checklist_id | TEXT | Foreign key → checklists.id |
| runner_name | TEXT | Optional; entered at start |
| started_at | DATETIME | |
| completed_at | DATETIME | Null if abandoned |
| responses | JSON | Array of response objects (see below) |

**Response object:**
```json
{
  "step_id": "uuid",
  "answer": "yes | no | skip",
  "note": "optional text",
  "answered_at": "ISO timestamp"
}
```

---

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/checklists` | List all checklists |
| POST | `/api/checklists` | Create checklist |
| PUT | `/api/checklists/:id` | Update checklist |
| DELETE | `/api/checklists/:id` | Delete checklist |
| POST | `/api/runs` | Start a run |
| PUT | `/api/runs/:id` | Update run (add responses, mark complete) |
| GET | `/api/runs?checklist_id=` | List runs for a checklist |

---

## UI — Screens

### Runner (public, mobile-first)

**Home (`/`)**
List of all checklists as large tappable cards. Each card shows: name, description, step count. Link to Admin in the corner.

**Name prompt**
Before the first step, optionally ask "Who's running this?" Free text, skippable. Stored as `runner_name` on the run.

**Step screen**
One step per screen. Large text prompt. Progress bar at top.
- If `allow_note: true`, a note textarea is shown below the question before the runner answers. They can type a note or leave it blank.
- Buttons: **✓ Yes** (green, primary), **✗ No** (secondary), **Skip** (ghost, only if `skippable: true`)
- Tapping Yes/No/Skip records the answer + any note and advances to the next step.

**Completion screen**
Shows: checklist name, runner name, step count answered. Scrollable summary of all responses with notes. Confirmation pills for Slack and email notifications sent. Back to home button.

### Admin (`/admin`, no auth — open URL)

**Checklist list**
Table: name, step count, run count, notification config. Actions per row: Edit, Runs, Delete. "New Checklist" button.

**Checklist editor**
- Name field
- Description field
- **Steps textarea** — large, monospace. One line = one step. Reorder by moving lines. On save, each line becomes a step.
- **Per-step options** — generated from the textarea; a row per step with checkboxes: "Allow note" and "Skippable"
- Slack webhook URL field
- Notification email field
- Import JSON / Export JSON buttons
- Save / Cancel

**Run log**
Filtered to one checklist. List of runs: runner name, date/time, duration, step completion count. Expandable rows showing full response detail per step.

---

## Notifications

Triggered server-side when a run is marked complete.

**Slack:** POST to the checklist's webhook URL with a formatted message:
```
✅ [Checklist Name] completed by [Runner] — [X/Y steps] — [timestamp]
Step responses: Yes: N, No: N, Skipped: N
```

**Email:** Send via Nodemailer to the checklist's notification email with an HTML summary of all responses and notes.

Both are fire-and-forget on completion. No notification on abandoned runs.

---

## Checklist Authoring

The textarea approach: each line of text becomes one step. The per-step options UI (allow note, skippable checkboxes) regenerates when the textarea loses focus — not while typing, to avoid a jumping UI. Saving persists the full step array with options.

Import/export is raw JSON of the `steps` array, making it easy to bulk-edit or transfer checklists between instances.

---

## Included Checklists (Seed Data)

The app ships with "Battle Stations" pre-loaded as a seed checklist. Steps:

1. Any open positions that conflict with this event? *(allow note)*
2. Caffeine or stimulant — take it now if you need it *(skippable)*
3. Food situation — eat now or don't. Nothing ordered within 30 min of event.
4. Surf open with profiles loaded?
5. All exchanges logged in? *(allow note)*
6. Low-latency feed ready? (NOT YouTube)
7. Screen recording started?

Slack webhook and notification email configurable via the admin editor after deploy.

---

## Out of Scope (V1)

- Authentication / access control
- Scenario weighting, sliders, countdown timers (Battle Stations-specific features from original spec)
- Push notifications
- Exchange login state checks via API
- Airtable integration
- Executor parallel track
- Real-time sync between runners
