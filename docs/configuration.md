# `jfdevelops.json`

`jfdevelops.json` records how the CLI set up the project and which files it manages. The CLI writes it after each successful change; you normally do not edit it by hand. Your package manifests stay the source of truth for dependencies, and the file never contains secrets or environment values.

```json
{
  "schemaVersion": 1,
  "generator": { "package": "@jfdevelops/cli", "version": "0.1.0" },
  "project": { "name": "shop", "packageManager": "pnpm" },
  "formatter": "prettier",
  "targets": [{ "path": ".", "kind": "app", "template": "node-app", "options": {} }],
  "addons": [{ "name": "convex", "options": {} }],
  "skills": [
    {
      "name": "jf-git",
      "required": true,
      "source": { "package": "@jfdevelops/skills", "version": "0.1.0", "path": "./skills/jf-git" }
    }
  ],
  "managedFiles": [
    { "path": ".agents/skills/jf-git/SKILL.md", "owner": { "type": "skill", "name": "jf-git" }, "sha256": "…" }
  ]
}
```

| Field | Description |
| --- | --- |
| `schemaVersion` | Always `1` today |
| `generator` | The CLI package and version that last wrote the setup with `init` or `create` |
| `project` | Package name and package manager |
| `formatter` | Formatter chosen by `create`, when there is one |
| `targets` | Each app or library in the project, by project-relative path, with its template and options |
| `addons` | Adopted integrations |
| `skills` | Enabled skills, whether each is required, and the exact package, version, and path they came from |
| `managedFiles` | Every file the CLI owns, its owner (`project`, a skill, or an addon), and the SHA-256 it last wrote |

The CLI validates the file on every read and rejects unknown fields, unsafe paths (absolute, `..`, backslashes, or drive letters), malformed hashes, duplicate entries, and managed files whose owning skill or addon is not enabled. An invalid file is never overwritten; fix or remove the reported field and run the command again.

## How the format evolves

This is the compatibility policy for future releases:

- Within schema version 1, new fields are only ever added as optional. The file is validated strictly, so an older CLI rejects a field it does not know. When a project is shared, upgrade its CLI development dependency before running a newer CLI's commands on it.
- A change to the meaning or shape of an existing field increments `schemaVersion`. The CLI release that introduces it upgrades older files as part of a normal, previewed command, and refuses files from a newer version instead of guessing.
- There is no hosted JSON Schema URL yet; none will be referenced from the file until one is published.

Because the exact CLI version is a development dependency of the project, everyone working on it runs the same CLI and reads the file the same way.
