# DeckDNA frontend — contributor guide

Frontend for DeckDNA, a service that turns any PowerPoint template and a brief into native, editable
decks in three layout variants, audits them and exports PPTX, PDF and HTML. Backend: FastAPI, separate
repository (`Ranel435/LCT-prezi-2026`); its OpenAPI is mirrored in `.claude/backend-snapshot/openapi.json`
and typed in `src/shared/api/schema.d.ts`.

Read first: `.claude/CLAUDE.md` (task, hard requirements, deadlines), `.claude/STATUS.md` (current state and
decisions), `docs/ASSISTANT_FLOW_RU.md` (the seven-step assistant flow being built), `ARCHITECTURE.md`.

## Rules

- React 19, TypeScript strict, Vite, React Router 7, TanStack Query, openapi-fetch, CSS Modules with the
  design tokens, Radix primitives, lucide icons.
- Feature-Sliced Design: `app / pages / widgets / features / entities / shared`; cross-slice imports only via
  a slice's `index.ts` and the `@/` alias. `npm run lint:fsd` must stay clean.
- No code comments. No watermarks or tool attribution anywhere, commit trailers included.
- Commit messages in English, imperative, one line.
- The UI shows only what the backend really returns; a missing endpoint (404/405/501) degrades quietly.
- Interface copy is Russian, short, first person, no words for AI or models.
- Every new behaviour gets unit tests; every new endpoint gets an MSW handler so `npm run dev:mock` works offline.

## Commands

```
npm ci
npm run dev:mock
npm run lint && npm run lint:fsd && npm run typecheck && npx vitest run && npm run build
npm run e2e
```
