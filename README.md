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

1. [Quick start with Docker](#quick-start-with-docker) (macOS, Windows, Linux)
2. [Architecture](#architecture)
3. [Local development](#local-development)
4. [Testing](#testing)
5. [Configuration](#configuration)
6. [Deployment](#deployment)
7. [Security & privacy](#security--privacy)
8. [Face recognition](#face-recognition)
9. [Known limitations & next steps](#known-limitations--next-steps)

---

## Quick start with Docker

The fastest way to try the app: **only Docker is needed** — no Node.js, pnpm or Python. The
whole stack (app + face service, Postgres + pgvector, MinIO for files) runs in containers.

### 1. Install Docker

You need Docker Engine **and** Docker Compose v2 (`docker compose`). Give Docker at least
**4 GB of memory** (6 GB is comfortable) — building the image needs it.

<details open>
<summary><b>macOS</b> (Apple Silicon or Intel)</summary>

- **Docker Desktop** — download from <https://www.docker.com/products/docker-desktop/>
  (pick _Apple Silicon_ or _Intel chip_), open the `.dmg`, drag Docker to Applications and
  start it. Or with Homebrew:

  ```bash
  brew install --cask docker
  open -a Docker            # wait until the whale icon says "Docker Desktop is running"
  ```

  Memory: _Settings → Resources → Memory_ (≥ 4 GB).

- **Alternatives** (free for commercial use): [OrbStack](https://orbstack.dev)
  (`brew install --cask orbstack`) or Colima:

  ```bash
  brew install colima docker docker-compose docker-buildx
  colima start --cpu 4 --memory 6
  ```

  With Colima, Compose is installed as a plugin; if `docker compose version` fails, follow the
  one-line hint Homebrew printed (adds `cliPluginsExtraDirs` to `~/.docker/config.json`) or use
  `docker-compose` (with a hyphen) in the commands below.

</details>

<details>
<summary><b>Windows 10 (22H2) / 11</b></summary>

1. Open **PowerShell as Administrator** and install WSL 2 (then restart Windows):

   ```powershell
   wsl --install
   ```

2. Install **Docker Desktop** from <https://www.docker.com/products/docker-desktop/>, or:

   ```powershell
   winget install -e --id Docker.DockerDesktop
   ```

   Start Docker Desktop and keep _Use the WSL 2 based engine_ enabled (the default).

3. Recommended: run everything **inside WSL** (Ubuntu) — it's much faster for file access, and
   the deploy scripts are bash. In Docker Desktop enable _Settings → Resources → WSL
   integration → Ubuntu_, then open the **Ubuntu** app and use the Linux commands below.
   Cloning in PowerShell also works; the repo's `.gitattributes` keeps shell scripts with Unix
   line endings so the image builds correctly either way.

Memory: with WSL 2, Docker can use up to half of your RAM by default (set `memory=6GB` under
`[wsl2]` in `%UserProfile%\.wslconfig` to change it).

</details>

<details>
<summary><b>Linux</b> (Ubuntu, Debian, Fedora, …)</summary>

```bash
curl -fsSL https://get.docker.com | sh       # Docker Engine + Compose plugin (official script)
sudo usermod -aG docker $USER                 # run docker without sudo …
newgrp docker                                 # … in this shell (or log out and back in)
```

Or follow the per-distribution guide at <https://docs.docker.com/engine/install/>. Docker
Desktop for Linux also works.

</details>

Check the installation (all three must succeed):

```bash
docker version
docker compose version
docker run --rm hello-world
```

### 2. Run the app

The same commands work in macOS Terminal, Linux shells, WSL and Windows PowerShell:

```bash
git clone https://github.com/imajij/Student_ERP_Fronetend.git college-erp
cd college-erp

docker compose --profile app up -d --build    # first build takes ~5–10 minutes
docker compose run --rm app migrate           # create the database tables
docker compose run --rm app seed              # sample college: admin, 2 faculty, 20 students
docker compose run --rm app demo              # optional: past attendance, marks and results
```

Open **<http://localhost:3080>** (`open http://localhost:3080` on macOS,
`start http://localhost:3080` on Windows, `xdg-open http://localhost:3080` on Linux).

**Sign in** with password `ChangeMe@123` as `admin`, `FAC001` / `FAC002` (faculty) or
`26CSE001` … `26CSE020` (students). You'll be asked to set a new password the first time.
After `demo`, students `26CSE001`–`003` and `26CSE011`–`013` are already onboarded.

Health check: <http://localhost:3080/api/health> → `{"ok":true,"database":true,"faceService":true}`.

### 3. Everyday commands

| Task                             | Command                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Status                           | `docker compose --profile app ps`                                                         |
| Follow the app's logs            | `docker compose logs -f app`                                                              |
| Rebuild after pulling new code   | `git pull` then `docker compose --profile app up -d --build` and `… run --rm app migrate` |
| Stop (data is kept)              | `docker compose --profile app down`                                                       |
| Start again                      | `docker compose --profile app up -d`                                                      |
| **Delete everything** (all data) | `docker compose --profile app down -v`                                                    |
| MinIO console (uploaded files)   | <http://localhost:9001> — `minioadmin` / `minioadmin`                                     |

Everything listens on `127.0.0.1` only, so nothing is exposed to your network. The demo
secrets in `docker-compose.yml` are for local testing only — never use this file in
production (see [Deployment](#deployment)). `seed` and `demo` refuse to run unless
`ALLOW_DEMO_DATA=1` is set, which only the local compose file does.

### Troubleshooting

| Problem                                                    | Fix                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` (5432, 9000, 9001, 8001, 3080) | Stop whatever uses it (often a local Postgres: `brew services stop postgresql` / `sudo systemctl stop postgresql`), or change the left side of the port in `docker-compose.yml` |
| Build stops with `killed` / exit code 137                  | Give Docker more memory (≥ 4 GB) and run the build again                                                                                                                        |
| `unknown flag: --profile` or `compose` not found           | You have Compose v1 — update Docker, or use `docker-compose` (with a hyphen)                                                                                                    |
| `start.sh: not found` / `\r` errors (Windows)              | The repo was checked out with CRLF line endings: `git config --global core.autocrlf input`, then clone again (or clone inside WSL)                                              |
| Signed in as the wrong user / logged out unexpectedly      | Browsers share cookies across `localhost` ports — don't run `pnpm dev` (:3000) and Docker (:3080) in the same browser profile, or sign out first                                |
| `faceService: false` in the health check                   | `docker compose logs app` — the face service runs inside the app container; manual attendance still works                                                                       |
| `Database already has users — skipping seed`               | Already seeded. To start over: `docker compose --profile app down -v`, then repeat step 2                                                                                       |

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

Installing the tools (Docker: see [Install Docker](#1-install-docker)):

| OS      | Node.js 22 + pnpm                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------- |
| macOS   | `brew install node@22 pnpm` (or [nvm](https://github.com/nvm-sh/nvm): `nvm install 22`, then `corepack enable pnpm`) |
| Windows | Inside WSL, as on Linux (recommended); or `winget install OpenJS.NodeJS.LTS` then `corepack enable pnpm`             |
| Linux   | [nvm](https://github.com/nvm-sh/nvm): `nvm install 22`, then `corepack enable pnpm`                                  |

This workflow runs the app on your machine with hot reload, and only the services in Docker
(the `app` container from the quick start is not started without `--profile app`).

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

**Single server (recommended):** one Docker image (app + internal face service) behind Caddy
(automatic HTTPS) with Postgres + pgvector on the same server, an S3/R2 bucket for photos and
nightly backups. One command deploys and updates:

```bash
cp deploy/env.deploy.example deploy/.env.deploy      # fill in domain, S3, first admin
deploy/deploy.sh --host ubuntu@<server-ip> --key ~/.ssh/key.pem
```

See **[deploy/README.md](deploy/README.md)** for the AWS walkthrough (EC2/Lightsail, security
group, DNS, S3 + least-privilege IAM), updates and automatic rollback, backups and restore,
and troubleshooting.

**Other platforms:** the image runs anywhere containers do (ECS, App Runner, Kubernetes,
Fly.io): `docker run … college-erp migrate`, `… bootstrap`, then the default `serve`. It needs
an external Postgres with pgvector and S3-compatible storage — details in deploy/README.md.

- Run behind HTTPS with a proxy that sets `X-Forwarded-For` from the real client (Caddy does).
- Health check: `GET /api/health` → `{ ok, database, faceService }` (503 if the DB is down).
- **Never run `db:seed` or `db:demo` in production** (`db:demo` refuses to).
- Deactivating an account does not delete face templates — use **Delete biometric data** in
  your offboarding process.

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
