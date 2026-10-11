---
name: add-or-fix-type-checking
description: Fixes Go type and static-analysis failures reported by go build, go vet, or script/lint (golangci-lint). Use when vet/lint/compile errors appear in local runs, CI, or PR logs. Adapted from huggingface/transformers' add-or-fix-type-checking skill.
---

# Add Or Fix Type Checking (Go)

## Input

- `<target>`: package pattern to check (for example `./pkg/github/...`), if known.
- Optional `script/lint`, `go vet`, or CI output showing failures.

## Workflow

1. **Identify scope from the failing run**:
   - If you have CI output (`go.yml`, `lint.yml`), extract the failing package and file paths.
   - Otherwise run the whole repo:
     ```bash
     go build ./... && go vet ./... && script/lint
     ```
   - Choose the narrowest package pattern that covers the failures.

2. **Get a focused baseline** for the target:
   ```bash
   go vet <target>
   bin/golangci-lint run <target>   # installed by script/lint
   ```

3. **Triage by category** before fixing anything:
   - Compile errors: mismatched types, wrong pointer/value, missing interface methods
   - `go vet`: printf verb/arg mismatches, copied locks, unkeyed composite literals,
     unreachable code, misuse of `errors.As`, struct tag errors
   - `errcheck`: unchecked errors
   - `staticcheck` / `gocritic` / `revive`: deprecated APIs, simplifications, naming (`ID`, `URL`, `API`)
   - `gosec`: unsafe conversions, unchecked inputs
   - `bodyclose`: unclosed `*http.Response` bodies

4. **Apply fixes in this priority order** (simplest first):

   a. **Fix the type at the source.** If a value is never nil, don't make it a pointer;
      if a function always returns one concrete type, don't return `any`/`interface{}`.

   b. **Use comma-ok type assertions and type switches** instead of bare assertions:
      ```go
      s, ok := v.(string)
      if !ok {
          return fmt.Errorf("expected string, got %T", v)
      }
      ```

   c. **Check every error.** Handle or return it with context (`fmt.Errorf("...: %w", err)`).
      Assign to `_` only when ignoring is provably safe, and say why in a short comment.

   d. **Close response bodies** right after the error check: `defer func() { _ = resp.Body.Close() }()`.

   e. **Match printf verbs to argument types** (`%d` ints, `%s` strings, `%v` general, `%w` wrapped errors).

   f. **Use generics** to remove repeated `any` conversions only when it cuts code at
      several call sites; don't add type parameters for a single use.

   g. **Use `//nolint:<linter> // reason`** only as a last resort for confirmed false
      positives or third-party API defects. Always name the specific linter and give a reason.

5. **Never**:
   - Use bare `//nolint` or disable linters in `.golangci.yml` to get green.
   - Use bare type assertions (`v.(T)`) on values that can hold other types; that panics.
   - Silence errors with `_ =` to satisfy `errcheck` without reasoning.
   - Add helpers or abstractions just to satisfy a linter for 1–2 occurrences.
   - Add nil checks for values guaranteed non-nil by the call chain; fix the type instead.

6. **Verify and close the loop**:
   - Re-run `go vet <target>` and `bin/golangci-lint run <target>`.
   - Run `script/lint` and `script/test` (both must pass).
   - If an MCP tool schema changed: `UPDATE_TOOLSNAPS=true go test ./...`, commit the
     `.snap` files, then run `script/generate-docs`.
