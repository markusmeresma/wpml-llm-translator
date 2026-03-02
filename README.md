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
- `npm run ingest -- --project-name <name> --source-lang <src> --target-lang <tgt>` - Parse XLIFF files from `INBOX_DIR` and create units (no translation yet)
- `npm run translate -- --project-id <uuid>` - Translate pending units for a project using the LLM (skips non-translatable/code-only units)
- `npm run rebuild -- --project-id <uuid>` - Rebuild verified project files into `OUTBOX_DIR`

## Workflow

1. Put `.xliff` files into `translations/inbox` (or configured `INBOX_DIR`).
2. Run `ingest` to create a project, files, and translation units.
3. Run `translate` to machine-translate pending units (code-only units are automatically skipped).
4. Review and update units through the API.
5. Verify readiness: `GET /api/projects/:id/readiness`.
6. Run `rebuild` for that project ID.
7. Zip `translations/outbox` manually and import into WPML.
