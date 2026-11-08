# CLAUDE.md

GitHub MCP Server: a Go stdio MCP server exposing GitHub tools. The remote server also uses it as a library, so keep reusable functions exported.

Full reference (structure, CI, workflows): `.github/copilot-instructions.md`. Read it only when you need detail beyond this file.

## Verify before committing

- `script/lint`: gofmt + golangci-lint
- `script/test`: `go test -race ./...`
- Single test: `go test ./pkg/github -run TestName`
- Tool schema changed: `UPDATE_TOOLSNAPS=true go test ./...`, commit `pkg/github/__toolsnaps__/*.snap`, then run `script/generate-docs`
- Never run `script/tag-release` or push tags.

## Conventions

- Acronyms in identifiers: `ID`, `API`, `URL`, `HTTP`.
- Tests: testify, table-driven; mock REST with go-github-mock, GraphQL with `internal/githubv4mock`.
- E2E tests need a PAT; still keep `e2e/e2e_test.go` in sync when changing tools.

## Working style

- State assumptions; ask when something is unclear.
- Write the minimum code the request needs: no speculative features or abstractions.
- Keep diffs surgical: leave unrelated code alone, remove only the orphans your change created.
- Define a verifiable success check and loop until it passes.

## Repo skills

- When `go build`, `go vet`, or `script/lint` fails, use the `add-or-fix-type-checking` skill (`.claude/skills/add-or-fix-type-checking/SKILL.md`).
