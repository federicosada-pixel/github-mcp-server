# SKILLS
Repeatable operations the AI runs in this vault. Full rules in [[AGENTS]].

## ingest <file>
1. Read the new file in `raw/`.
2. Write `wiki/sources/<name>.md` (frontmatter + summary + key claims with citations).
3. Create or update linked pages in `wiki/entities/` and `wiki/concepts/`.
4. Add the new pages to `index.md`.
5. Append an entry to `log.md`.

## query <question>
1. Read `index.md`.
2. Open the relevant pages; answer with `[[links]]` and `(raw/...)` citations.
3. Offer to save the answer as a new wiki page.

## lint
Find contradictions, stale claims, orphan pages and missing links; fix them; append a report to `log.md`.

## Page template
```markdown
---
title: Page Title
type: entity | concept | source | comparison
sources:
  - raw/articles/example.md
updated: YYYY-MM-DD
---
# Page Title
Summary in two or three sentences.

## Key points
- Claim. (raw/articles/example.md)

## Related
- [[other-page]]
```
