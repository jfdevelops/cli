---
'@jfdevelops/cli': minor
---

Add `jfdevelops create skills` for library authors. It selects the owning package in a workspace (or `--package <name>`), offers existing `SKILL.md` directories for registration, scaffolds new skills from a name and description, or handles a single `--path <skill-directory>`. It records them in `jfdevelops.skills`, adds their directory to `files` when it would otherwise be left out, and then verifies the registrations and the `npm pack` contents so consumers receive every skill file. Repeat runs add no duplicate registrations.
