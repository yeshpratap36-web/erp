# College ERP

Attendance (with face recognition), academics and administration for a college — one Next.js app
(frontend + backend), PostgreSQL + pgvector, S3-compatible storage.

> Full setup & deployment docs arrive in Phase 9. This is the Phase 1 quick start.

## Prerequisites

- Node.js ≥ 20.9, pnpm ≥ 10
- Docker with `docker-compose`

## Quick start

```bash
pnpm install                 # also generates the Prisma client
cp .env.example .env         # defaults match docker-compose
pnpm services:up             # Postgres (pgvector) :5432, MinIO :9000 (console :9001), face service :8001
pnpm db:migrate              # apply migrations
pnpm db:seed                 # 1 admin, 2 faculty, 20 students, courses, timetable
pnpm dev                     # http://localhost:3000
```

Optional demo data (dev only): `pnpm db:demo` marks the first 3 students of each section as fully
onboarded and generates past classes with attendance, so the student and faculty dashboards
have something to show. Safe to re-run.

Seeded logins all use `SEED_DEFAULT_PASSWORD` (default `ChangeMe@123`) and must change it on
first login: `admin`, `FAC001`, `FAC002`, `26CSE001` … `26CSE020`.

## Scripts

| Script                                     | Purpose                                |
| ------------------------------------------ | -------------------------------------- |
| `pnpm dev` / `build` / `start`             | Next.js                                |
| `pnpm lint` / `typecheck` / `format`       | ESLint, TypeScript, Prettier           |
| `pnpm test` / `test:e2e`                   | Vitest unit tests / Playwright         |
| `pnpm services:up` / `services:down`       | Local Postgres + MinIO                 |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Prisma migrations, seed, wipe & reseed |
| `pnpm db:studio`                           | Browse the database                    |

## Face recognition

`services/face` is a small internal Python (FastAPI) service running OpenCV Zoo's **YuNet**
detector (MIT) and **SFace** recognizer (Apache-2.0), chosen for their commercial-friendly
licenses. It is stateless and only callable by the Next.js backend with `FACE_SERVICE_TOKEN`
(generate with `openssl rand -hex 32`; docker-compose reads it from `.env`). The app talks to
it through `FaceRecognitionProvider` (`lib/face/`), so it can be swapped (e.g. AWS Rekognition)
without touching app logic; switching models requires students to re-enroll.

Biometric data handling: explicit, versioned consent; 128-d embeddings in pgvector, never
returned by any API; raw photos in the private bucket and deleted after enrollment by default
(`face.deleteRawPhotosAfterEnrollment`); admins can delete a student's data on request.

## Auth & access control

Three layers, all required:

1. **`proxy.ts`** — fast route protection from JWT claims (login, onboarding gate, role areas).
2. **Server checks** — `requireRole()` / `requirePermission()` (`lib/auth/session.ts`) in every
   layout, Server Action and API route (`apiRoute()` in `lib/api.ts`). These reload the user from
   the DB, so deactivation and password resets (`sessionVersion` bump) take effect immediately.
3. **Scoped queries** — `lib/auth/scope.ts` (`assertSectionAccess`, `assertStudentAccess`, …).

Permissions live in `lib/permissions.ts`; routing rules in `lib/auth/routing.ts`.

## End-to-end tests

`pnpm test:e2e` builds the app, **resets and seeds a separate `college_erp_test` database**
(never your dev DB), and runs the auth flows at desktop and mobile sizes. First run:
`pnpm exec playwright install chromium`.

## Layout

```
app/            routes — (auth), (student), (faculty), (admin), api/
components/     UI (shadcn/ui in components/ui)
lib/            db, env, auth, permissions, validators, face/
prisma/         schema, migrations, seed
generated/      Prisma client (git-ignored, created by `prisma generate`)
tests/          unit (Vitest) and e2e (Playwright)
```
