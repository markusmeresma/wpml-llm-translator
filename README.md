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
- `npm run ingest` - Run ingestion CLI (scaffolded)
- `npm run rebuild` - Run rebuild CLI (scaffolded)
