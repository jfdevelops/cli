---
title: Authoring skills
description: Register and publish agent skills from a library package.
order: 70
---

A library publishes skills by bundling skill directories in its npm package and listing them in `package.json`. Use `create skills` to register those directories and verify what consumers will receive.

In this guide you will:

- Register or scaffold a skill directory.
- Include its resources in the published package.
- Verify the package consumers will install.

## Register a skill

```json
{
  "name": "@acme/forms",
  "files": ["dist", "skills"],
  "jfdevelops": {
    "skills": [{ "name": "build-forms", "path": "./skills/build-forms" }]
  }
}
```

Each path is a directory inside the package containing a `SKILL.md` whose frontmatter `name` matches both the registration and the directory name:

```text
---
name: build-forms
description: Build forms with validation and accessible errors.
---

# Build Forms

Steps, commands, and conventions for the agent to follow.
```

Names are lowercase kebab-case, at most 64 characters. Descriptions are 1 to 1024 characters after trimming. Each path starts with `./`, its segments use only letters, digits, `_`, and `-`, and it must stay inside the package after symlinks are resolved. A skill may include other files, such as `references/`, which are copied with it; bundled symlinks and special files are rejected.

## `jfdevelops create skills`

Run it in the library, or in a workspace that contains it. It needs a terminal, and it does not need `jfdevelops.json`:

```sh
npx @jfdevelops/cli create skills
```

1. **Choose the package.** `--package <name>` matches a target by its package name. Otherwise the only named package that is not an app is used, or you choose. With none, the command fails.
2. **Register or scaffold.** Unregistered `SKILL.md` directories in the package are offered for registration (`node_modules` anywhere, `dist`, `.git`, and the installed copies in `.agents/skills`, `.claude/skills`, `.cursor/skills`, and `.github/skills` are ignored). Skills with invalid frontmatter or a mismatched name are reported and never modified. Duplicate names are reported with "Register one with --path". You can also scaffold a new skill from a name and description in `skills/<name>/`, or pass `--path <skill-directory>`, relative to the current directory or the package root, to register that directory or scaffold one there. Scaffolding needs an empty or missing directory.
3. **Update `package.json`.** Registrations are added to `jfdevelops.skills` without duplicates. When the `files` field would leave a skill out of the published package, the skill's top-level directory is added to it. Other fields, their order, and the file's indentation are kept.
4. **Verify publication.** The CLI checks every registration as a consumer will see it, then runs `npm pack --dry-run` without lifecycle scripts, which needs npm on `PATH`, and confirms every file of every skill is in the tarball. Files that npm never publishes are skipped. Missing files are listed with the fix, and the command exits with code 1.

Running it again on a package whose skills are all registered changes nothing and repeats the publication check, so it is safe in a release checklist. The CLI never publishes; release the library with your usual process.

After publishing, consumers get the skills with `npx @jfdevelops/cli init`, `jfdevelops add skill <name>`, or, for integrations, `jfdevelops add addon <name>`, and keep them current with `jfdevelops skills sync` or `jfdevelops skills update`. Shared convention skills are not authored this way; they are maintained in the `jfdevelops/skills` repository.

## Next steps

- [Look up `create skills`](commands.md#create-skills).
- [See how consumers receive skills](skills.md#where-skills-come-from).
- [Understand `jfdevelops.json`](configuration.md).
