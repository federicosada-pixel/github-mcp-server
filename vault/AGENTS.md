# Vault Schema (LLM Wiki)
You (the AI) maintain this vault. Obsidian is the IDE, you are the programmer, the vault is the codebase.

## Layers
- `raw/` — immutable sources (articles, PDFs, images, data). READ ONLY. Never edit.
- `notes/` + `evidence/` — human-written notes and raw data (Second Brain). Read; edit only when asked.
- `wiki/` — AI-owned. Summaries, entity/concept pages, comparisons. You create and update freely.

## Conventions
- One topic per page, kebab-case filenames. Link with `[[page-name]]`.
- Every page starts with YAML frontmatter: `title`, `type` (entity|concept|source|comparison), `sources` (list of raw/ paths), `updated` (YYYY-MM-DD).
- Cite claims with the raw source path, e.g. `(raw/articles/hermes-kanban.md)`.

## Operations
- **Ingest**: read new file in `raw/` → write `wiki/sources/<name>.md` summary → create/update linked entity & concept pages → update `index.md` → append to `log.md`.
- **Query**: read `index.md` first, open relevant pages, answer with `[[links]]` and citations. Offer to save useful answers as a new wiki page.
- **Lint**: find contradictions, stale claims, orphan pages, missing links; fix them; append a report to `log.md`.

Always read `ME.md`, `MAP.md`, `SKILLS.md` at the start of a session.
