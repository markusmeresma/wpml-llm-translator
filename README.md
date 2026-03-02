# wpml-llm-translator

LLM-powered translation pipeline for WPML XLIFF files with human review and safe re-import.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts

- `npm run dev` - Run API server in watch mode
- `npm run build` - Compile TypeScript to `dist/`
- `npm run start` - Run compiled API server
- `npm run ingest` - Parse XLIFF files and create units (no translation yet)
- `npm run translate` - Translate pending units using the LLM (skips non-translatable/code-only units)
- `npm run rebuild` - Rebuild verified project files into the outbox

## Directory layout

Each subdirectory in `translations/inbox/` is a separate project. The outbox mirrors the same structure.

```
translations/inbox/
├── front-page/
│   ├── job-1007.xliff
│   └── job-1008.xliff
└── full-site/
    ├── job-1009.xliff
    └── job-1010.xliff

translations/outbox/
├── front-page/
│   ├── job-1007.xliff
│   └── job-1008.xliff
└── full-site/
    └── ...
```

## CLI usage

```bash
# Ingest one project (subdirectory name = project name)
npm run ingest -- --project front-page --source-lang en --target-lang pl

# Ingest ALL subdirectories at once
npm run ingest -- --source-lang en --target-lang pl

# Translate one project
npm run translate -- --project front-page

# Translate ALL projects
npm run translate

# Rebuild by project name → writes to outbox/front-page/
npm run rebuild -- --project front-page
```

## Workflow

1. Create a subdirectory per project in `translations/inbox/` and place `.xliff` files inside.
2. Run `ingest` to create projects, files, and translation units.
3. Run `translate` to machine-translate pending units (code-only units are automatically skipped).
4. Review and update units through the API.
5. Verify readiness: `GET /api/projects/:id/readiness`.
6. Run `rebuild` for that project name.
7. Zip the project subdirectory from `translations/outbox/` and import into WPML.
