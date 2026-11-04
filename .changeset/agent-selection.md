---
'@jfdevelops/cli': minor
---

`init` and `create` now ask which coding agents should load the skills (Claude Code, Codex, Cursor, GitHub Copilot) and record the choice in `jfdevelops.json`. Each skill is installed once in `.agents/skills`; Claude Code gets a small stub per skill in `.claude/skills` and a `CLAUDE.md` pointer instead of a full copy, except for skills that use Claude Code's argument substitution, `${CLAUDE_*}` variables, or command injection, which keep a full copy there. The next `skills sync` in an existing project replaces the old `.claude/skills` copies with stubs and removes the `.cursor/skills` and `.github/skills` copies.
