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
pnpm services:up             # Postgres (pgvector) on :5432, MinIO on :9000 (console :9001)
pnpm db:migrate              # apply migrations
pnpm db:seed                 # 1 admin, 2 faculty, 20 students, courses, timetable
pnpm dev                     # http://localhost:3000
```

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

## Layout

```
app/            routes — (auth), (student), (faculty), (admin), api/
components/     UI (shadcn/ui in components/ui)
lib/            db, env, auth, permissions, validators, face/
prisma/         schema, migrations, seed
generated/      Prisma client (git-ignored, created by `prisma generate`)
tests/          unit (Vitest) and e2e (Playwright)
```
