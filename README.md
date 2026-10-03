# CourseVault

**DecodeLabs Full Stack Development Industrial Training Kit — Batch 2026 — Project 3: Database Integration**
Part 2 of the *CourseHub* series — the persistent sibling of NeuroAPI.

CourseVault is a course-management platform where **PostgreSQL is the final source of truth**:
every business rule the UI shows (unique emails, seat limits, instructor-only teaching)
is enforced by a real database constraint, and the frontend proves it live.

## 3-command quick start

```bash
# 1. Start Postgres and create the schema + seed data
docker compose up -d && npm run db:migrate && npm run db:seed

# 2. Run it (API on :4000, client on :5173)
npm run dev:all

# 3. Run the test suite (53 tests)
npm test
```

Copy `.env.example` to `server/.env` first if you change any defaults.
Open http://localhost:5173 — the **Security** screen is the best 2-minute tour.

## What it does

| Screen | Shows |
|---|---|
| **Vault** | Live stats from `GET /stats` (animated counters, courses-per-level bars, fill-rate ring), DB status chip from `/ready`, feed of recent mutations |
| **Schema** | Interactive ER diagram built from `GET /schema` (real `information_schema` introspection): PK/FK markers, labelled 1:1 · 1:M · M:M beams, highlighted junction table, click any table for columns, constraints and indexes |
| **Data Studio** | Users / Courses / Enrollments tabs: search, sort, pagination, create/edit modals, delete with confirm + optimistic rollback, humanized constraint errors, and a Query Inspector panel showing each request's SQL, params and duration |
| **Security** | Injection Lab (vulnerable pattern *displayed, never executed* vs the parameterized query that actually runs) with payload presets and an animated vault door; plus one-click demos where UNIQUE / NOT NULL / CHECK / FK violations are rejected by the real database |
| **Docs** | Endpoint cards, Scalar reference link, the CRUD ↔ HTTP ↔ SQL mapping table, and the decision records below |

## Schema

```mermaid
erDiagram
    users ||--|| user_profiles : "1:1 has"
    users ||--o{ courses : "1:M teaches"
    users ||--o{ enrollments : "M:M via"
    courses ||--o{ enrollments : "M:M via"
    users {
        uuid id PK
        text name "NOT NULL, 2..60"
        text email "NOT NULL, UNIQUE lower(email)"
        text role "learner|instructor"
        timestamptz created_at
        timestamptz updated_at
    }
    user_profiles {
        uuid user_id PK_FK "ON DELETE CASCADE"
        text bio "CHECK <= 300"
        text country
        smallint age "CHECK 16..100"
    }
    courses {
        uuid id PK
        uuid instructor_id FK "ON DELETE RESTRICT"
        text title "3..80, UNIQUE(instructor_id,title)"
        text level "beginner|intermediate|advanced"
        int seats "CHECK 1..500"
        date start_date
    }
    enrollments {
        uuid user_id PK_FK "ON DELETE CASCADE"
        uuid course_id PK_FK "ON DELETE CASCADE"
        text status "active|completed|dropped"
        timestamptz enrolled_at
    }
```

Full DDL with triggers (`set_updated_at`, `ensure_instructor_role`) lives in
`server/db/migrations/001_init.sql`, applied by a transactional, idempotent runner
(`server/db/migrate.ts`, tracked in `schema_migrations`). Seed: 3 instructors,
12 learners, 8 courses, 30 enrollments (`npm run db:seed`).

## Schema decisions

**Why PostgreSQL (SQL) over NoSQL here.** The domain is *relational*: users own
profiles (1:1), instructors teach courses (1:M), learners enroll in courses (M:M).
The interesting guarantees — "an email is unique", "a course can't be oversold",
"only instructors teach" — are cross-row invariants. In Postgres they are
declarative constraints and ACID transactions; in a document store they'd be
application code that races. JOIN + GROUP BY also powers `/stats` in one round trip.

**Native `pg` driver vs ORM (decision record).** Chosen: the native driver with a
`Pool`. For Project 3 the point is to *learn SQL*: parameterized queries, transactions,
and constraint behavior stay visible instead of hidden behind generated code. The
trade-off is boilerplate (manual row→DTO mapping). The repository layer
(`server/src/repos/`) holds **all** SQL, so Drizzle or Prisma 7 could replace it
later without touching routes or validation — the migration path is a seam, not a rewrite.

**Validate twice.** Zod 4 at the API boundary (syntactic → `400`), PostgreSQL
constraints as the final arbiter (business rules → `422`/`409`). The Security screen
demonstrates each constraint rejecting a real request.

## API

Base `/api/v1`, JSON only, plural nouns. OpenAPI 3.1 at `/openapi.json`
(generated from the Zod schemas), interactive reference at `/reference` (Scalar).

CRUD ↔ HTTP ↔ SQL:

| HTTP | Status | SQL |
|---|---|---|
| `POST /users` | 201 + `Location` | `INSERT` |
| `GET /users` | 200 | `SELECT` (+ `ILIKE` search, pagination) |
| `PUT /users/:id` · `PATCH /users/:id` | 200 | `UPDATE` |
| `DELETE /users/:id` | 204 | `DELETE` |

Plus: `GET /users/:id/profile` + `PUT` (upsert), `GET /users/:id/enrollments`,
`GET /courses/:id` (with instructor + `enrolledCount`),
`GET|POST /courses/:id/enrollments`, `DELETE /courses/:id/enrollments/:userId`,
`GET /stats`, `GET /schema`, `GET /health`, `GET /ready`,
`POST /lab/injection-demo`.

Enrollment capacity is enforced in **one transaction** (`SELECT … FOR UPDATE`,
count active, `409` if full) — the test suite fires 8 parallel requests at the
last seat and asserts exactly one succeeds.

Errors are RFC 9457 `application/problem+json` with an `X-Request-Id` header;
SQL text, stacks and credentials never leak. SQLSTATE mapping: `23505`→409,
`23503`→409 on delete-restrict / 422 on missing reference, `23514`→422,
`23502`→400, `22P02`→400, connection failures→503 with `Retry-After`.

Query Inspector: with `DEMO_SQL_INSPECTOR=true`, any request with `?inspect=1`
includes `meta.queries: [{sql, params, durationMs}]`. Forced off in production.

## Deployment (Render + Neon, free tiers)

1. Create a free Postgres at [neon.tech](https://neon.tech), copy the connection
   string (it includes `?sslmode=require` — the pool enables SSL automatically).
2. On [render.com](https://render.com): New → Web Service → point at this repo.
   Build: `npm install && npm run build` · Start: `npm start`.
3. Environment: `DATABASE_URL` (Neon URL), `CORS_ORIGINS` (your Render URL),
   `NODE_ENV=production`. `DEMO_SQL_INSPECTOR` stays unset.
4. After first deploy, run migrations + seed once:
   `DATABASE_URL=<neon-url> npm run db:migrate && DATABASE_URL=<neon-url> npm run db:seed`
   (or run them from your machine with the Neon URL).
5. The Express server serves `client/dist`, so the whole app is **one service**
   plus the managed database. Supabase works the same way.

## Project layout

```
coursevault/
├── server/          Express 5 API (TypeScript, Zod 4, native pg)
│   ├── db/          migrations, transactional runner, seed, reset
│   └── src/         config, pool, middleware, repos (all SQL), routes, OpenAPI
├── client/          React 19 + Vite + Tailwind v4 + Motion
│   └── src/         screens, vault-canvas background, responsive nav, API client
├── docker-compose.yml   postgres:17-alpine for local dev
└── requests.http    every endpoint, ready for the VS Code REST client
```

## What I learned

- **Constraints are a design tool, not a safety net.** Writing `CHECK (seats BETWEEN 1 AND 500)`
  *is* the product decision; the UI just narrates what the database already guarantees.
- **Parameterized queries are non-negotiable.** The Injection Lab exists because string
  concatenation is the easiest vulnerability to write and the easiest to prevent —
  `$1` placeholders plus an escaped `ILIKE` pattern close it completely.
- **`SELECT … FOR UPDATE` is the honest answer to "two users click enroll at once."**
  Counting seats in application code races; row-locking in one transaction doesn't.
- **A repository layer is an ORM migration path.** All SQL in one seam means the
  native driver was a choice, not a lock-in.
- **Error mapping is UX.** `23505` means nothing to a user; "This email is already
  registered — UNIQUE constraint" does. RFC 9457 gives that a standard shape.

---

Built by Asim — DecodeLabs Industrial Training Kit — Batch 2026
