# College ERP

Attendance (with face recognition), academics and administration for a college, in one
Next.js app (frontend + backend), backed by PostgreSQL + pgvector, S3-compatible storage
and a small internal face-recognition service.

| Role            | What they can do                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Super admin** | Academic structure (departments, programs, years/terms/holidays, courses, sections, rooms), accounts (single + CSV bulk import), timetable builder with clash detection, analytics & at-risk students, settings, announcements, requests, audit log |
| **Faculty**     | Today's schedule, face or manual attendance with review, cancel/restore/extra classes, rosters + CSV export, assessments & marks (grid or CSV), publish marks and final grades, leave/correction approvals, section announcements                   |
| **Student**     | First-login onboarding (password → biometric consent or opt-out → face enrollment), attendance (overall/per subject, "classes needed"), timetable, results (SGPA/CGPA), leave & correction requests, announcements, notifications                   |

---

## Contents

1. [Architecture](#architecture)
2. [Local development](#local-development)
3. [Testing](#testing)
4. [Configuration](#configuration)
5. [Deployment](#deployment)
6. [Security & privacy](#security--privacy)
7. [Face recognition](#face-recognition)
8. [Known limitations & next steps](#known-limitations--next-steps)

---

## Architecture

```
 Browser (phones first)
   │  HTTPS
   ▼
 Next.js 16 (App Router, Node runtime)
   ├─ proxy.ts ............ route protection from the JWT (layer 1)
   ├─ Server Components ... pages; requireRole()/requirePermission() (layer 2)
   ├─ Server Actions ...... formAction(): permission → Zod → service → refresh
   ├─ Route Handlers ...... apiRoute(): authenticate → authorize → validate → act
   └─ lib/services/* ...... business rules + row-level scoping (layer 3)
         │                        │                         │
         ▼                        ▼                         ▼
   PostgreSQL 17 + pgvector   S3 / R2 / MinIO (private)   services/face (FastAPI)
   (Prisma 7, adapter-pg)     raw photos, never served    YuNet + SFace, stateless,
                                                          token-protected, internal only
```

- **Code layout**
  - `app/` — routes: `(auth)` sign-in/onboarding, `(admin)`, `(faculty)`, `(student)`, `api/`
  - `lib/` — `auth/` (session, routing, scope), `permissions.ts`, `services/`, `validators/`,
    `face/` (provider interface + client), pure logic in `academics/`, `attendance/`,
    `timetable/`, `communication/`
  - `components/` — UI (shadcn/ui in `components/ui`), charts, forms
  - `prisma/` — schema, migrations, `seed.ts` (dev), `demo.ts` (dev), `bootstrap.ts` (prod)
  - `services/face/` — the face service; `tests/` — unit (Vitest) and e2e (Playwright)
- **Pure modules are unit-tested**: grading/GPA, attendance math, timetable expansion and
  clash detection, face matching, routing/permission rules, CSV validation, request rules.

## Local development

Prerequisites: **Node.js ≥ 20.9** (22 recommended), **pnpm ≥ 10**, **Docker** (with
`docker compose` or `docker-compose`). Python is only needed to run the face-service tests.

```bash
pnpm install                     # also generates the Prisma client
cp .env.example .env             # then set AUTH_SECRET and FACE_SERVICE_TOKEN (see below)
pnpm services:up                 # Postgres+pgvector :5432, MinIO :9000 (console :9001), face :8001
pnpm db:migrate                  # apply migrations
pnpm db:seed                     # dev data: 1 admin, 2 faculty, 20 students, courses, timetable
pnpm db:demo                     # optional: past attendance, marks, results, onboarded students
pnpm dev                         # http://localhost:3000
```

Generate the two secrets with `openssl rand -base64 32` (AUTH_SECRET) and
`openssl rand -hex 32` (FACE_SERVICE_TOKEN). All ports are bound to `127.0.0.1`.

**Seeded logins** (password `ChangeMe@123`, changed at first sign-in): `admin`, `FAC001`,
`FAC002`, `26CSE001` … `26CSE020`. Login IDs are case-insensitive; college emails work too.
`pnpm db:demo` marks the first three students of each section as fully onboarded (resetting
their password to `ChangeMe@123`) and is safe to re-run. `pnpm db:reset` wipes and reseeds the
dev database.

| Script                                  | Purpose                                        |
| --------------------------------------- | ---------------------------------------------- |
| `pnpm dev` / `build` / `start`          | Next.js                                        |
| `pnpm lint` / `typecheck` / `format`    | ESLint, TypeScript, Prettier                   |
| `pnpm test` / `test:e2e` / `test:face`  | Vitest / Playwright / face-service pytest      |
| `pnpm services:up` / `services:down`    | Local Postgres, MinIO, face service            |
| `pnpm db:migrate` / `db:deploy`         | Create+apply migrations (dev) / apply (prod)   |
| `pnpm db:seed` / `db:demo` / `db:reset` | Dev seed / dev demo data / wipe and reseed     |
| `pnpm admin:bootstrap`                  | Production: settings, grade scale, first admin |
| `pnpm db:studio`                        | Browse the database                            |

> If a code change doesn't seem to apply in `pnpm dev`, restart it — Turbopack occasionally
> misses edits made by external tools.

## Testing

- **Unit** — `pnpm test` (Vitest, ~110 tests on the pure modules).
- **End-to-end** — `pnpm test:e2e` (Playwright; first time: `pnpm exec playwright install chromium`).
  Each run **creates its own database** (`college_erp_e2e_<timestamp>`), migrates and seeds it,
  builds and starts the app against it on port 3100, and **drops that database afterwards**
  (`E2E_KEEP_DB=1` keeps it). Your dev database is never touched. Covers sign-in, lockout,
  session revocation, onboarding, admin setup + CSV import + timetable clashes + audit log,
  face enrollment, face attendance with review, marks → student results, and leave approval.
  Auth flows also run at phone size.
  Face tests use public-domain NASA portraits downloaded at test time into the OS temp dir
  (never committed); they skip if offline or if the face service isn't running.
- **Face service** — `cd services/face && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`,
  then `FACE_MODEL_DIR=<models dir> .venv/bin/pytest`. See `services/face/README.md`.
- **CI** — `.github/workflows/ci.yml` runs format/lint/typecheck/unit/audit, the face-service
  tests (models verified by checksum), and the e2e suite against docker-compose services.

## Configuration

| Variable                                      | Required | Notes                                                                            |
| --------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | yes      | PostgreSQL with the `vector` extension available                                 |
| `AUTH_SECRET`                                 | yes      | ≥ 32 chars; signs session JWTs. Rotating it signs everyone out                   |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`       | yes      | Private bucket (R2: `https://<account>.r2.cloudflarestorage.com`, region `auto`) |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`    | yes      | Scoped to that one bucket                                                        |
| `S3_FORCE_PATH_STYLE`                         | no       | `true` for MinIO                                                                 |
| `FACE_SERVICE_URL`, `FACE_SERVICE_TOKEN`      | yes      | Internal URL of `services/face`; same token configured on the service            |
| `APP_TIMEZONE`                                | no       | IANA zone for "today" and displayed times (default `Asia/Kolkata`)               |
| `SEED_DEFAULT_PASSWORD`                       | dev      | Password for seeded accounts                                                     |
| `ADMIN_LOGIN_ID`, `ADMIN_EMAIL`, `ADMIN_NAME` | once     | For `pnpm admin:bootstrap`                                                       |

Institution settings (attendance threshold, face thresholds, photo retention, lockout, grade
scale) are edited by admins at **Admin → Settings** and audit-logged.

## Deployment

The app is a standard Node server plus three backing services.

1. **PostgreSQL 15+ with pgvector** — managed options that support `vector`: AWS RDS/Aurora,
   Google Cloud SQL, Azure Flexible Server, Neon, Supabase. The first migration runs
   `CREATE EXTENSION IF NOT EXISTS vector` (needs a role allowed to create it).
2. **Object storage** — Cloudflare R2 (or S3). Create one **private** bucket; no public access,
   no CORS needed (the browser never talks to it). Optional lifecycle rule to expire
   `attendance/` objects after 7 days as a backstop (they're deleted on confirmation).
3. **Face service** — build `services/face/Dockerfile` (it downloads the models and verifies their
   checksums). Run it on a **private network only** (e.g. a private service on Fly.io/Railway/
   ECS/Cloud Run with internal ingress), with `FACE_SERVICE_TOKEN` set. ~1 GB RAM is plenty;
   scale with `--workers`. It stores nothing.
4. **The app**
   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm db:deploy                      # apply migrations (run once per release)
   ADMIN_LOGIN_ID=principal ADMIN_EMAIL=principal@college.edu ADMIN_NAME="Principal" pnpm admin:bootstrap
   pnpm start                          # behind an HTTPS reverse proxy / load balancer
   ```
   - Run behind HTTPS. The proxy must set `X-Forwarded-For` (used for login rate limiting).
   - Health check: `GET /api/health` → `{ ok, database, faceService }` (503 if the DB is down).
   - **Never run `db:seed` or `db:demo` in production** (`db:demo` refuses to).
   - Vercel works too: face photo processing uses `after()` within the route's `maxDuration`
     (60 s); the face service must be reachable from Vercel (e.g. a token-protected endpoint
     behind a private link or IP allowlist).
5. **Backups & retention** — daily `pg_dump` (or managed PITR) with tested restores; the audit
   log is append-only and should be retained per institutional policy. Face templates are
   deleted when an admin deletes a student's biometric data; deactivating an account does
   not delete them — include that in your offboarding process.

## Security & privacy

- **Authentication** — Auth.js (Credentials) with argon2id hashes; login by roll number /
  employee ID / email. Only failed attempts count toward rate limits (100/15 min per IP for
  campus NAT, 10/15 min per account) and accounts lock after 5 failures (configurable).
  Temporary passwords are shown once and must be changed at first sign-in.
- **Sessions** — JWTs carry role + onboarding state, but every request re-loads the user: a
  `sessionVersion` bump (password reset/change, deactivation) revokes all sessions instantly.
- **Authorization in three layers** — `proxy.ts` (routes), `requireRole`/`requirePermission`/
  `formAction`/`apiRoute` (every page, action and API), and scoped queries in
  `lib/auth/scope.ts` (faculty see only their sections; students only themselves; another
  faculty's class returns 404). Permissions live in `lib/permissions.ts`.
- **Validation** — Zod on every form, body and query string; CSV imports validate every row
  before writing anything and exports are formula-injection safe.
- **Headers** — CSP (no external scripts, no framing, no plugins, same-origin connections),
  HSTS (production), nosniff, strict referrer, camera only for this origin. The CSP allows
  inline scripts because nonces would disable the prerendered static shells; to switch to a
  nonce-based CSP, follow the Next.js CSP guide (all pages become dynamic).
- **Biometric data** — explicit, versioned consent (IP, browser and the exact text variant
  recorded) with an in-app **opt-out** (attendance then manual); 128-d templates in pgvector,
  never returned by any API; enrollment photos deleted after templates are created (setting);
  classroom photos deleted when attendance is confirmed and never sent back to a browser;
  duplicate faces across accounts are blocked and audited; admins can delete a student's data.
- **Audit log** — account creation, password resets, deactivation/unlock, settings and
  grade-scale changes, biometric consent/enrollment/deletion, attendance overrides (face
  rejections, manual additions, post-confirmation edits, approved leaves/corrections),
  published marks/results and edits to published marks. Viewer + CSV export for admins.
- **Dependencies** — `pnpm audit --prod` is clean; transitive patches are pinned in
  `pnpm-workspace.yaml` overrides.

## Face recognition

- OpenCV Zoo **YuNet** detector (MIT) + **SFace** recognizer (Apache-2.0) — chosen for
  commercial-friendly licenses (InsightFace's pretrained models are non-commercial).
- Enrollment: 5 guided photos (front, slight left/right/up/down), each must contain exactly one
  sharp, well-lit, large-enough face of the same person; one template per photo.
- Attendance: faculty upload 1–3 classroom photos → every face is matched only against the
  section-course's enrolled students (best of 5 samples, one-to-one per photo) → **matched**
  (≥ 0.42), **uncertain** (≥ 0.33, faculty must decide), **unmatched**. Nothing counts until the
  faculty confirms; each record stores method, confidence and confirmer.
- Everything goes through `FaceRecognitionProvider` (`lib/face/provider.ts`); a paid API can be
  swapped in without touching app logic (students must re-enroll — templates aren't portable).

## Known limitations & next steps

- **Calibrate thresholds with a pilot.** Defaults follow OpenCV's guidance; two different people
  in a public-domain test set scored 0.337, just above the "uncertain" line. Match outcomes
  (no templates) are stored in `DetectedFace` for this — expect to raise `uncertain` to ~0.36–0.38.
- **Background work runs in-process.** Face processing uses `after()` and notifications are
  written inline; at large scale move both to a job queue (e.g. pg-boss).
- No email/SMS notifications or password self-service (admins reset passwords).
- One default grade scale and one institution timezone.
- Faculty schedule changes apply immediately (no admin approval step).
