# Checklister

Lightweight web app for creating and running step-by-step checklists. An admin creates checklists; anyone with the URL can run them. Completion triggers Slack and/or email notifications.

## Requirements

- Node.js 18+

## Local Setup

```bash
git clone <repo>
cd checklister
npm install
cp .env.example .env   # then edit .env with your values
npm run seed           # optional: seed the "Battle Stations" sample checklist
npm start              # http://localhost:3000
```

- **Runner UI:** http://localhost:3000
- **Admin UI:** http://localhost:3000/admin

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `3000`) |
| `DB_PATH` | No | SQLite file path (default: `./data.db`) |
| `ADMIN_PASSWORD` | No | Password for admin UI and checklist mutations. If unset, admin is open. |
| `SMTP_HOST` | If using email | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | If using email | SMTP username |
| `SMTP_PASS` | If using email | SMTP password |
| `SMTP_FROM` | No | From address for notification emails |
| `BATTLE_STATIONS_SLACK_WEBHOOK` | No | Slack webhook for the seeded checklist |
| `BATTLE_STATIONS_EMAIL` | No | Notification email for the seeded checklist |

## Testing

```bash
npm test
```

Uses Jest + Supertest with an in-memory SQLite database. No external services required.

## Deployment (Railway)

1. Create a new Railway project and connect this repo.
2. Add a Railway Volume; set `DB_PATH` to the volume mount path (e.g. `/data/data.db`).
3. Set environment variables in the Railway dashboard.
4. Deploy — Railway uses `npm start` via the `Procfile`.

The server handles `SIGTERM` gracefully (Railway sends this on deploys), closing in-flight requests and the database connection before exiting.

## Admin Auth

Set `ADMIN_PASSWORD` in your environment. Visiting `/admin` redirects to `/admin/login` when unauthenticated. The runner UI at `/` requires no login — anyone with the URL can run a checklist.

Protected endpoints (require valid session cookie):
- `POST /api/checklists` — create
- `PUT /api/checklists/:id` — update
- `DELETE /api/checklists/:id` — delete
- `GET /api/runs` — view run history

## Health Check

`GET /health` — returns `{ status: "ok", uptime: <seconds> }`. Use with Railway health checks or an uptime monitor.
