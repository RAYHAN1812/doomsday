# Doomsday Ready

A small full-stack app that helps MCU fans plan their rewatch before **Avengers: Doomsday** and book an
opening-night watch party.

- **API:** Node.js, Express 5, TypeScript, SQLite (Node's built-in `node:sqlite`, so nothing native to compile)
- **Frontend:** React 19 + Vite
- **Tests:** Vitest + Supertest (every expected result from the brief is a test)
- **Run it:** Docker Compose, one command

---

## Quick start

### With Docker (recommended)

```bash
docker compose up --build
```

Open **http://localhost:8080**. The database starts with the brief's sample movies and one cinema per
booking example, so every view has something to show straight away.

Data is kept in the `api-data` volume. To start again from scratch: `docker compose down -v`.

### Without Docker

Requires Node.js 22.13 or newer (24 recommended).

```bash
# Terminal 1: API on http://localhost:3000/api
cd server
npm install
npm run dev

# Terminal 2: frontend on http://localhost:5173 (forwards /api to the API)
cd web
npm install
npm run dev
```

| Command (in `server/`) | What it does |
| --- | --- |
| `npm test` | Runs the unit and API tests |
| `npm run typecheck` | Type-checks the API and tests |
| `npm run build && npm start` | Production build and start |
| `npm run seed` | Adds the sample data to empty tables |

API settings (environment variables): `PORT` (default `3000`), `DATABASE_PATH` (default `data/doomsday.db`),
`SEED_SAMPLE_DATA` (default `true`; set `false` to start with an empty database).

---

## Features

### 1. Movies and rewatch order

- Create movies with a unique title, release year, runtime (1–300 min), optional prerequisites and a
  watched flag (default `false`). Prerequisites and watched can be changed later.
- Any create or update that would make a movie depend on itself, directly or through other movies, is
  rejected with **`409 CIRCULAR_DEPENDENCY`** and nothing is saved.
- `GET /api/movies/:id/rewatch-order` returns every movie you need to see first, each exactly once, in an
  order where every movie comes after its prerequisites (the target itself is left out). It also returns
  how many are watched and the total runtime of the unwatched ones.

**How it works** ([`server/src/logic/graph.ts`](server/src/logic/graph.ts), no graph libraries):

- **Cycle check.** Giving movie *M* the prerequisites *P* creates a cycle exactly when *M* can already be
  reached by following prerequisite links from some movie in *P* (or *P* contains *M*). An iterative
  depth-first search from *P* looks for *M*. This runs on every update, inside the same database
  transaction as the write. A new movie can never close a cycle, because nothing depends on it yet.
- **Rewatch order.** First, a depth-first walk collects all of the target's ancestors (prerequisites,
  their prerequisites, and so on). Then Kahn's topological sort orders just those movies: a movie becomes
  "ready" once all of its prerequisites are placed. When several are ready at once, the earliest release
  (then title) goes first, so the plan reads roughly chronologically and the output is deterministic.
- Both are O(V + E) for the movies and links involved.

### 2. Cinemas and watch-party booking

- Create cinemas with a unique name and 1–10 different bundle sizes, each 1–500 seats.
- `GET /api/cinemas/:id/booking?groupSize=N` (N = 1–10,000) returns the fewest bundles whose seats add
  up to exactly N, and how many of each size to buy, or says it isn't possible.

**How it works** ([`server/src/logic/booking.ts`](server/src/logic/booking.ts), no solver libraries):
this is the classic minimum coin-change problem. A greedy "biggest bundle first" approach is wrong
(with sizes 1, 3, 4 and a group of 6 it picks 4+1+1 instead of 3+3), so it uses dynamic programming:
`fewest[n]` holds the fewest bundles that make exactly *n* seats, built up from `fewest[0] = 0` using
`fewest[n] = 1 + min(fewest[n − size])`. The bundle chosen at each step is remembered, so the answer is
rebuilt by walking back from N. That is O(N × sizes), at most 10,000 × 10 = 100,000 steps. When two
answers use equally few bundles, the one with bigger bundles wins.

### 3. Frontend

| View | What you can do |
| --- | --- |
| **Movies** | Add movies, edit their prerequisites (searchable checklist), tick them as watched, delete them |
| **Rewatch Plan** | Pick a target and see the ordered list with watched ticks, a progress bar ("4 of 7 watched") and the remaining watch time. Ticking a movie here updates it everywhere |
| **Booking** | Pick a cinema, enter a group size and see the bundles to buy, or "Not possible". You can also add cinemas here |

---

## API reference

All endpoints are under `/api` and send and receive JSON.

| Method and path | Purpose |
| --- | --- |
| `POST /movies` | Create a movie |
| `GET /movies` | List movies |
| `GET /movies/:id` | Get one movie *(extra)* |
| `PATCH /movies/:id` | Update a movie, including `watched` and `prerequisiteIds` |
| `DELETE /movies/:id` | Delete a movie and remove it from other movies' prerequisites *(extra)* |
| `GET /movies/:id/rewatch-order` | Rewatch order (feature 1) |
| `POST /cinemas` | Create a cinema |
| `GET /cinemas` | List cinemas |
| `GET /cinemas/:id` | Get one cinema *(extra)* |
| `DELETE /cinemas/:id` | Delete a cinema *(extra)* |
| `GET /cinemas/:id/booking?groupSize=6` | Booking quote (feature 2) |
| `GET /health` | Health check *(extra)* |

### Examples

```http
POST /api/movies
{ "title": "The Avengers", "releaseYear": 2012, "runtimeMinutes": 143, "prerequisiteIds": [1, 2] }

201 Created
{ "id": 3, "title": "The Avengers", "releaseYear": 2012, "runtimeMinutes": 143, "watched": false, "prerequisiteIds": [1, 2] }
```

```http
PATCH /api/movies/1
{ "prerequisiteIds": [7] }

409 Conflict
{ "error": { "code": "CIRCULAR_DEPENDENCY", "message": "A movie cannot depend on itself, directly or through other movies" } }
```

```http
GET /api/movies/4/rewatch-order

200 OK
{
  "target": { "id": 4, "title": "Captain America: Civil War" },
  "movies": [ { "id": 1, "title": "Iron Man", ... }, { "id": 2, ... }, { "id": 3, "title": "The Avengers", ... } ],
  "totalCount": 3,
  "watchedCount": 0,
  "unwatchedCount": 3,
  "unwatchedRuntimeMinutes": 393
}
```

```http
GET /api/cinemas/2/booking?groupSize=11

200 OK
{ "cinema": { "id": 2, "name": "Wakanda Picture House" }, "groupSize": 11,
  "possible": true, "totalBundles": 4, "bundles": [ { "size": 5, "count": 1 }, { "size": 2, "count": 3 } ] }

GET /api/cinemas/4/booking?groupSize=7

200 OK
{ "cinema": { "id": 4, "name": "Asgard Odeon" }, "groupSize": 7, "possible": false, "totalBundles": null, "bundles": [] }
```

### Errors

Every error has the same shape: `{ "error": { "code", "message", "details"? } }`.

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | A field is missing, the wrong type, or out of range (`details` lists which) |
| 400 | `INVALID_JSON` | The request body is not valid JSON |
| 400 | `INVALID_ID` | The `:id` in the path is not a positive whole number |
| 400 | `UNKNOWN_PREREQUISITE` | A prerequisite id does not exist (`details.missingIds`) |
| 404 | `NOT_FOUND` | The movie, cinema or route does not exist |
| 409 | `CIRCULAR_DEPENDENCY` | The change would make a movie depend on itself |
| 409 | `TITLE_TAKEN` / `NAME_TAKEN` | Another movie or cinema already has that title or name |

---

## Data model

```mermaid
erDiagram
    MOVIES ||--o{ MOVIE_PREREQUISITES : "has prerequisites"
    MOVIES ||--o{ MOVIE_PREREQUISITES : "is prerequisite of"
    CINEMAS ||--|{ CINEMA_BUNDLE_SIZES : sells

    MOVIES {
        int id PK
        text title UK "unique, case-insensitive"
        int release_year
        int runtime_minutes "1-300"
        bool watched "default false"
    }
    MOVIE_PREREQUISITES {
        int movie_id PK, FK "watch this movie..."
        int prerequisite_id PK, FK "...after this one"
    }
    CINEMAS {
        int id PK
        text name UK "unique, case-insensitive"
    }
    CINEMA_BUNDLE_SIZES {
        int cinema_id PK, FK
        int size PK "1-500 seats"
    }
```

- Movie prerequisites form a **directed acyclic graph**. `movie_prerequisites` is the edge list
  (movie → the movie to watch first). The database blocks direct self-links (a `CHECK` constraint); the
  API blocks longer loops.
- Deleting a movie or cinema removes its links and bundle sizes too (`ON DELETE CASCADE`).
- The API returns prerequisites as `prerequisiteIds` on each movie, and bundle sizes as `bundleSizes`
  on each cinema.

---

## Decisions and assumptions

Where the brief was open, these are the choices I made:

- **Release year** has no range in the brief. I accept whole numbers from 1888 (the oldest surviving
  film) to 2100.
- **Titles and cinema names** are trimmed and unique ignoring case, so "iron man" clashes with "Iron Man".
- **Prerequisites** are referenced by movie id. Sending `prerequisiteIds` in a `PATCH` replaces the whole
  list. Repeated ids are merged. Unknown ids are rejected with `400 UNKNOWN_PREREQUISITE`.
- **Self-reference** (a movie listed as its own prerequisite) returns `409 CIRCULAR_DEPENDENCY`, the same
  as a longer loop, since it is the "directly" case in the brief.
- **Rewatch order ties.** Any valid order is accepted by the brief. I pick the earliest release (then
  title) among movies that are ready, which gives a stable, chronological-feeling list.
- **Repeated bundle sizes** (e.g. `[5, 2, 5]`) are merged before the "1 to 10 different sizes" rule is
  checked.
- **Booking ties.** When several combinations use the same fewest bundles, the one with bigger bundles is
  returned.
- **"Not possible"** is a normal answer, not an error, so it returns `200` with `"possible": false`.
  Invalid input (e.g. `groupSize=0`) returns `400`.
- **Group size** must be plain digits in the query string: `6` is accepted, `6.5` and `1e3` are not.
- **Sample data.** An empty database is filled with the brief's movies (real release years and
  runtimes; Doomsday's 150 minutes is a placeholder) and one cinema per booking example. The cinema names
  are made up.
- **Extras** beyond the brief: `GET` one movie or cinema, `DELETE` for both, and a health check.
- **Storage.** SQLite through Node's built-in `node:sqlite` keeps setup to `npm install` with nothing
  native to compile. Node prints an "experimental feature" warning for it in development; the
  production start command hides that warning.

---

## Project structure

```
.
├── docker-compose.yml
├── server/                 Express API
│   ├── src/
│   │   ├── logic/          graph.ts (feature 1) and booking.ts (feature 2): pure, hand-written logic
│   │   ├── movies/         schema (validation), service (database + rules), routes
│   │   ├── cinemas/        schema, service, routes
│   │   ├── app.ts          Express app (used by the server and the tests)
│   │   ├── db.ts           SQLite schema and transaction helper
│   │   ├── errors.ts       error type and JSON error handler
│   │   └── seed.ts         sample data
│   └── tests/              logic.test.ts (unit), api.test.ts (HTTP, in-memory database)
└── web/                    React app
    └── src/
        ├── api.ts          typed API client
        ├── views/          MoviesView, RewatchView, BookingView
        └── components/     PrerequisitePicker
```

