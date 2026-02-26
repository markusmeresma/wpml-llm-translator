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
- `npm run ingest -- --project-name <name> --source-lang <src> --target-lang <tgt>` - Ingest files from `INBOX_DIR`
- `npm run rebuild -- --project-id <uuid>` - Rebuild verified project files into `OUTBOX_DIR`

## Workflow

1. Put `.xliff` files into `translations/inbox` (or configured `INBOX_DIR`).
2. Run ingest to create a project, files, and units with machine translations.
3. Review and update units through the API.
4. Verify readiness: `GET /api/projects/:id/readiness`.
5. Run rebuild for that project ID.
6. Zip `translations/outbox` manually and import into WPML.
