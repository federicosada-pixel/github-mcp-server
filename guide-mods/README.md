# guide-mods

Seven Claude Code mods, rebuilt from the "9 Claude Mods you need to try" guide.

| Mod | What it does |
| --- | --- |
| `file-tracker` | Bubble above the prompt with every file and page Claude touched; `/ring` lists them all |
| `reflect` | Spots your corrections and offers to save them as rules in `CLAUDE.md` (Save / Global / Edit / Skip) |
| `replay-theater` | After a turn, `/replay` steps through each file edit as a diff |
| `blast-radius` | Holds `rm -rf` / `git clean -f` and lists exactly what would be deleted, with Proceed / Cancel |
| `savvy-progress` | Live view of every subagent: model, tool calls, context size, estimated cost (`/agents-info`) |
| `retheme` | `/skin noir \| tokyo-night \| dracula \| catppuccin \| off` restyles tool rows and Edit diff cards (terminal sessions only: the Claude apps draw tool rows themselves) |
| `cache-tax` | Holds a message once when the prompt cache went cold and shows the cost; `/keepwarm` keeps it warm |

## Install

```
git clone https://github.com/federicosada-pixel/github-mcp-server.git
claude plugin marketplace add ./github-mcp-server/guide-mods
claude plugin install file-tracker@guide-mods
claude plugin install reflect@guide-mods
claude plugin install replay-theater@guide-mods
claude plugin install blast-radius@guide-mods
claude plugin install savvy-progress@guide-mods
claude plugin install retheme@guide-mods
claude plugin install cache-tax@guide-mods
```

Pick the user scope so each loads in every session. Mods run with your permissions; read the source before installing.

## Caveats

- Cost figures (`savvy-progress`, `cache-tax`) are estimates from a built-in price table, not your bill.
- `blast-radius` is a safety net, not a permission system. It needs `find` and `git`.
- `cache-tax` assumes a 60-minute cache (subscription); API-key sessions default to 5 minutes.
