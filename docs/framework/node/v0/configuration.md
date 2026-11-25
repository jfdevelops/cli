---
title: Configuration
description: Understand the project setup and file ownership recorded in jfdevelops.json.
order: 60
---

`jfdevelops.json` records how the CLI set up the project and which files it manages. The CLI writes it after each run that applies changes, recording what was actually written; you normally do not edit it by hand. Your package manifests stay the source of truth for dependencies, and the file never contains secrets or environment values.

```json
{
  "schemaVersion": 1,
  "generator": { "package": "@jfdevelops/cli", "version": "0.10.0" },
  "project": { "name": "@acme/forms", "packageManager": "pnpm" },
  "formatter": "prettier",
  "targets": [{ "path": ".", "kind": "library", "template": "typescript-library", "options": {} }],
  "addons": [{ "name": "docs", "options": { "package": ".", "name": "Forms" } }],
  "agents": ["claude-code", "codex"],
  "skills": [
    {
      "name": "jf-git",
      "required": true,
      "source": {
        "package": "@jfdevelops/skills",
        "version": "3f9c2e1a7b4d5c6e8f0a1b2c3d4e5f6a7b8c9d0e",
        "path": "./skills/jf-git"
      }
    },
    {
      "name": "use-design-tokens",
      "required": false,
      "source": { "package": "@acme/design-tokens", "version": "2.3.0", "path": "./skills/use-design-tokens" }
    }
  ],
  "managedFiles": [
    { "path": ".agents/skills/jf-git/SKILL.md", "owner": { "type": "skill", "name": "jf-git" }, "sha256": "…" },
    { "path": ".github/workflows/docs.yml", "owner": { "type": "addon", "name": "docs" }, "sha256": "…" }
  ]
}
```

| Field | Description |
| --- | --- |
| `schemaVersion` | Always `1` today |
| `generator` | The CLI package and version that last wrote the setup with `create` or `init`, including the `init` that `update` runs. Other commands keep it |
| `project` | Package name and package manager |
| `formatter` | Formatter chosen by `create`, when there is one. `update` regenerates tooling only for `prettier` or `biome` |
| `targets` | Each app or library in the project, by project-relative path, with its template and options. A `template` appears only for packages the CLI created, including `add package`. Option values are strings, numbers, or booleans |
| `addons` | Adopted integrations. The docs addon records `{ "package": "<directory>", "name": "<library name>" }`; a docs addon without `package` is unfinished, and `jfdevelops add addon docs` finishes it |
| `agents` | Coding agents that load the skills: `claude-code`, `codex`, `cursor`, or `copilot`. A file without it, written before agents were selectable, is treated as selecting all of them |
| `skills` | Enabled skills, whether each is required, and the exact package, version, and path they came from. `required` is `true` only for shared convention skills, whose package stays `@jfdevelops/skills` and whose version is the commit of `jfdevelops/skills` `main` that was cloned |
| `managedFiles` | Every file the CLI owns, its owner (`project`, a skill, or an addon), and the SHA-256 it last wrote |

The CLI validates the file on every read and rejects unknown fields, skill names that are not kebab-case, unsafe paths (absolute, backslashes, drive letters, or empty, `.`, or `..` segments), hashes that are not lowercase hexadecimal, duplicate entries, and managed files whose owning skill or addon is not enabled. An invalid file is never overwritten; fix or remove the reported field and run the command again.

## How the format evolves

The file has `schemaVersion` `1`. The CLI validates it strictly, so an older CLI rejects a field it does not know. When a project is shared, upgrade its CLI development dependency before running a newer CLI's commands on it. There is no hosted JSON Schema URL yet, and the file does not reference one.

Because the exact CLI version is a development dependency of the project, everyone working on it runs the same CLI and reads the file the same way.

## Next steps

- [Look up commands](commands.md).
- [Manage skills and conflicts](skills.md).
- [Adopt addons](addons.md).
