# WPML XLIFF Translation Pipeline (v1)

## Purpose

This document defines a **minimal, deterministic translation pipeline** for WPML XLIFF files that supports:

- Offline ingestion of WPML-exported `.xliff` files
- Machine translation via LLM during ingestion
- Human review via a simple UI
- Safe reconstruction of XLIFF files
- Manual ZIP import back into WPML

The system is intentionally small and boring.
It optimises for **correctness, traceability, and zero XML breakage**.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | **Supabase** (hosted Postgres) | All tables live in Supabase. Use `@supabase/supabase-js` client. |
| Backend API | **Express (Node.js / TypeScript)** | REST API with Swagger UI documentation. |
| Frontend | **Lovable** (external) | Out of scope for this codebase. Consumes the API. |
| LLM | **OpenRouter** | Model configurable via `OPENROUTER_MODEL` env var. |
| Auth | **Shared API key** | All API endpoints require `X-API-Key` header. No login. |
| CLI Scripts | **Node.js (TypeScript)** | Ingest and rebuild are CLI scripts, not API endpoints. |

---

## Environment Variables

All configuration is via `.env` file at project root.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | yes | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | Supabase service role key (used by both API and CLI) |
| `API_KEY` | yes | — | Shared API key checked via `X-API-Key` header |
| `OPENROUTER_API_KEY` | yes | — | OpenRouter API key |
| `OPENROUTER_MODEL` | no | `anthropic/claude-sonnet-4-6` | OpenRouter model identifier |
| `INBOX_DIR` | no | `./translations/inbox` | Directory to read XLIFF files from |
| `OUTBOX_DIR` | no | `./translations/outbox` | Directory to write rebuilt XLIFF files to |
| `CORS_ORIGIN` | no | `*` | Allowed CORS origin for the Lovable frontend |
| `PORT` | no | `3000` | API server port |

---

## Core Mental Model

### What WPML gives you
- **One `.xliff` file = one WPML translation job**
- A ZIP may contain multiple `.xliff` files
- The ZIP is just a container

### What this system introduces
- A **project** = one ingestion run of multiple `.xliff` files
- Projects are **internal**, not a WPML concept
- Projects are created explicitly by the operator

---

## Key Principles

1. **XLIFF is the source of truth for structure and mapping**
2. **The database stores text + review state only**
3. **Humans and LLMs never touch XML**
4. **Only `<target><![CDATA[...]]></target>` is ever modified**
5. **Everything is deterministic and reversible**

---

## Terminology

| Term | Meaning |
|------|--------|
| Project | One translation run created at ingestion time |
| File | One `.xliff` file (one WPML job) |
| Unit | One `<trans-unit>` inside an XLIFF file |
| Unit key | Internal name for `trans-unit @id` |

---

## Filesystem Layout

Paths are configurable via `INBOX_DIR` and `OUTBOX_DIR` env vars.

```
/translations/
  /inbox/     # Operator manually unzips WPML export here (INBOX_DIR)
    job-1007.xliff
    job-1008.xliff

  /outbox/    # Rebuilt XLIFF files written here (OUTBOX_DIR)
    job-1007.xliff
    job-1008.xliff
```

- Ingestion reads from `INBOX_DIR`
- Rebuild writes to `OUTBOX_DIR`
- ZIP creation is manual

---

## Project Structure (Codebase)

```
/
  src/
    cli/
      ingest.ts          # Ingestion CLI script
      rebuild.ts         # Rebuild CLI script
    api/
      server.ts          # Express app setup, middleware, Swagger
      routes/
        projects.ts      # /api/projects routes
        units.ts         # /api/units routes
      middleware/
        auth.ts          # X-API-Key verification
    lib/
      supabase.ts        # Supabase client init
      openrouter.ts      # OpenRouter LLM client
      xliff-parser.ts    # XLIFF parsing logic
      xliff-writer.ts    # XLIFF rebuild logic
  translations/
    inbox/
    outbox/
  .env
  package.json
  tsconfig.json
```

---

## Project Creation

### Who sets the project name?
**The operator**, explicitly, at ingestion time.

### Where is it set?
Via the ingestion CLI.

### Example
```
npx ts-node src/cli/ingest.ts \
  --project-name pl_products_march_2026 \
  --source-lang en \
  --target-lang pl
```

Rules:
- `--project-name` is **required**
- Names are human-readable and semantic
- No inference from ZIP names or filenames
- Projects are immutable once created

---

## Database Schema (v1)

### `projects`

Represents one ingestion run.

| Field | Type | Description |
|------|------|------------|
| id | UUID | Internal project identifier |
| name | string | Operator-defined project name |
| source_lang | string | Source language (e.g. `en`) |
| target_lang | string | Target language (e.g. `pl`) |
| created_at | timestamp | Project creation time |

---

### `files`

Represents one XLIFF file (one WPML job).

| Field | Type | Description |
|------|------|------------|
| id | UUID | Internal file id |
| project_id | UUID | Owning project |
| file_key | string | Filename (e.g. `job-1007.xliff`) |
| original_attr | string | `<file original="...">` value |
| external_href | string (nullable) | Page URL from `<external-file>` |
| created_at | timestamp | Ingest time |

---

### `units`

Represents one `<trans-unit>`.

| Field | Type | Description |
|------|------|------------|
| id | UUID | Internal unit id |
| project_id | UUID | Redundant but useful |
| file_id | UUID | Owning file |
| unit_key | string | `trans-unit @id` |
| resname | string (nullable) | Semantic hint (e.g. `title`) |
| restype | string (nullable) | Usually `string` |
| source_text | text | Exact CDATA from `<source>` |
| machine_text | text (nullable) | LLM translation |
| review_text | text (nullable) | Human-edited text |
| status | enum | `todo` → `in_review` → `verified` (see Status Flow) |
| updated_at | timestamp | Last modification |

Derived (not stored):

```
final_text = review_text ?? machine_text ?? ""
```

---

### Supabase SQL Migration

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

create type unit_status as enum ('todo', 'in_review', 'verified');

create table projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  source_lang text not null,
  target_lang text not null,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  file_key text not null,
  original_attr text not null,
  external_href text,
  created_at timestamptz not null default now(),
  unique (project_id, file_key)
);

create table units (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  unit_key text not null,
  resname text,
  restype text,
  source_text text not null,
  machine_text text,
  review_text text,
  status unit_status not null default 'todo',
  updated_at timestamptz not null default now(),
  unique (project_id, file_id, unit_key)
);

-- Index for common queries
create index idx_units_project_status on units(project_id, status);
create index idx_units_file_id on units(file_id);

-- RLS is NOT enabled. The Express API uses the service_role key
-- which bypasses RLS. Auth is handled at the API layer via X-API-Key.
```

---

## Translation Unit Identity

A unit is uniquely identified by:

```
(project_id, file_key, unit_key)
```

Where:
- `file_key` = XLIFF filename
- `unit_key` = `trans-unit @id`

---

## Status Flow

```
todo  →  in_review  →  verified
```

- **`todo`**: Initial state after ingestion.
- **`in_review`**: Automatically set when `review_text` is first written via `PATCH /api/units/:id`.
- **`verified`**: Explicitly set by the reviewer. Requires non-empty `final_text` (`review_text ?? machine_text`).

Status can be moved backwards (e.g. `verified` → `in_review`) via the API — no restrictions on direction.

---

## LLM Translation Strategy (v1)

### Provider
**OpenRouter** — model set via `OPENROUTER_MODEL` env var.

Use the OpenRouter chat completions endpoint (`POST https://openrouter.ai/api/v1/chat/completions`) with the OpenAI-compatible SDK or plain `fetch`.

### Batching
**Unit-by-unit** — one API call per `<trans-unit>`. No batching.

### Error handling
If the LLM call fails for a unit, **store the unit with `machine_text = null` and continue**. Do not retry, do not abort. The human reviewer must translate that unit manually.

### Context sent to the LLM
Only:
- source language
- target language
- `resname`
- `restype`
- source text

No XML. No IDs. No datatype.

---

### Canonical LLM Prompt

```
You are translating website content.

Source language: {SOURCE_LANG}
Target language: {TARGET_LANG}

Content context:
- resname: {RESNAME}
- restype: {RESTYPE}

Rules:
- Translate naturally for a professional B2B website.
- Preserve any HTML tags exactly as they appear.
- Do not add or remove tags, placeholders, or product codes.
- Do not add explanations or commentary.
- Return only the translated text.

Text to translate:
<<<
{SOURCE_TEXT}
>>>
```

---

## Offline Ingestion Script

### Script
`src/cli/ingest.ts` — run via `npx ts-node src/cli/ingest.ts` or compiled equivalent.

### CLI Usage
```
npx ts-node src/cli/ingest.ts \
  --project-name pl_products_march_2026 \
  --source-lang en \
  --target-lang pl
```

### Responsibilities
1. Require `--project-name`, `--source-lang`, `--target-lang`
2. Discover all `.xliff` files in `INBOX_DIR`
3. Parse XML using a real parser (e.g. `fast-xml-parser` or `xmldom`)
4. Extract:
   - file metadata (`<file original="...">`, `<external-file>`)
   - `trans-unit @id` → `unit_key`
   - `resname`, `restype`
   - source text (CDATA content from `<source>`)
5. Generate machine translation via OpenRouter (unit-by-unit)
6. On LLM failure: store unit with `machine_text = null`, continue
7. Persist everything to Supabase
8. Leave original XLIFF files untouched
9. Log progress to stdout (file count, unit count, failures)

---

## Backend API

### Framework
**Express (TypeScript)** with **Swagger UI** documentation via `swagger-ui-express` + `swagger-jsdoc` (or equivalent).

Swagger UI served at `GET /api-docs`.

### Authentication
All endpoints require a shared API key via the `X-API-Key` header. The server checks it against the `API_KEY` env var in middleware. No login, no user accounts. The Lovable frontend stores the key and sends it with every request.

### CORS
Enable CORS for the Lovable frontend origin (configurable via `CORS_ORIGIN` env var, default `*` for development).

### Base path: `/api`

---

### List projects
```
GET /api/projects
```

Returns array of:
- `id` (UUID)
- `name`
- `source_lang`
- `target_lang`
- `total_units` (count)
- `verified_units` (count)
- `created_at`

---

### Get project
```
GET /api/projects/:id
```

Returns single project with same fields as list.

---

### List units
```
GET /api/projects/:id/units
```

Query params:
- `status` — filter by status (`todo`, `in_review`, `verified`)
- `search` — full-text search on `source_text`, `machine_text`, `review_text`
- `limit` — max results (default `50`)
- `offset` — pagination offset (default `0`)

Returns array of unit objects.

---

### Get unit
```
GET /api/units/:id
```

Returns single unit with all fields.

---

### Update unit
```
PATCH /api/units/:id
```

Body:
```json
{
  "review_text": "...",
  "status": "verified"
}
```

Rules:
- Setting `review_text` for the first time automatically sets `status` to `in_review` (unless `status` is explicitly set to `verified` in the same request)
- Setting `status` to `verified` requires non-empty `final_text` (`review_text ?? machine_text`)
- Both fields are optional; you can update one or both

---

### Readiness check
```
GET /api/projects/:id/readiness
```

Returns:
```json
{
  "ready": true,
  "total_units": 42,
  "verified_units": 42,
  "remaining_units": 0
}
```

---

## Rebuild Script

### Script
`src/cli/rebuild.ts` — run via `npx ts-node src/cli/rebuild.ts`.

### CLI Usage
```
npx ts-node src/cli/rebuild.ts --project-id <UUID>
```

### Behavior
1. Fetch project and all its units from Supabase
2. Abort with error if any unit is not `verified`
3. Load original XLIFF files from `INBOX_DIR`
4. For each `<trans-unit>`, replace `<target><![CDATA[...]]></target>` with `final_text`
5. Write rebuilt files to `OUTBOX_DIR`
6. Do not modify any other XML
7. Log output file paths to stdout

---

## Manual ZIP Step

Run inside `/translations/outbox`:

```
zip -r translations_pl.zip *.xliff   -x "__MACOSX/*" -x "*/._*"
```

Import ZIP into WPML.

---

## Operational Flow

1. Export XLIFF ZIP from WPML
2. Unzip into `INBOX_DIR` (e.g. `./translations/inbox`)
3. Run `npx ts-node src/cli/ingest.ts --project-name ... --source-lang en --target-lang pl`
4. Human reviews translations in Lovable UI (consumes the API)
5. Check project readiness via `GET /api/projects/:id/readiness`
6. Run `npx ts-node src/cli/rebuild.ts --project-id <UUID>`
7. ZIP rebuilt files manually from `OUTBOX_DIR`
8. Import ZIP into WPML
9. Mark jobs completed in WPML

---

## Explicit Non-Goals (v1)

- No automatic WPML export/import
- No XML editing in UI
- No translation memory
- No glossary enforcement
- No multi-user workflows
- No automatic ZIP creation

---

## Final Rule

**Projects are human intent.  
Files are WPML jobs.  
Units are strings.  
XML is sacred.**
