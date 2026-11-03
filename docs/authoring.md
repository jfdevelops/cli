# Authoring skills in a library

A library publishes skills by bundling skill directories in its npm package and listing them in `package.json`:

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

```md
---
name: build-forms
description: Build forms with validation and accessible errors.
---

# Build Forms

Steps, commands, and conventions for the agent to follow.
```

Names are lowercase kebab-case, at most 64 characters. Descriptions are 1 to 1024 characters. A skill may include other files, such as `references/`, which are copied with it.

## `jfdevelops create skills`

Run it in the library, or in a workspace that contains it:

```sh
npx @jfdevelops/cli create skills
```

1. **Choose the package.** The only library is used automatically; in a workspace you choose, or pass `--package <name>`.
2. **Register or scaffold.** Unregistered `SKILL.md` directories in the package are offered for registration (installed copies under `.agents`, `.claude`, `.cursor`, `.github`, `dist`, and `node_modules` are ignored). Skills with invalid frontmatter or a mismatched name are reported and never modified. You can also scaffold a new skill from a name and description, or pass `--path <skill-directory>` to register that directory or scaffold one there.
3. **Update `package.json`.** Registrations are added to `jfdevelops.skills` without duplicates. When the `files` field would leave a skill out of the published package, the skill's top-level directory is added to it. Other fields, their order, and the file's indentation are kept.
4. **Verify publication.** The CLI checks every registration as a consumer will see it, then runs `npm pack --dry-run` and confirms every file of every skill is in the tarball. Missing files are listed with the fix, and the command exits with code 1.

Running it again on a package whose skills are all registered changes nothing and repeats the publication check, so it is safe in a release checklist. The CLI never publishes; release the library with your usual process.

After publishing, consumers get the skills with `jfdevelops init`, `jfdevelops add skill <name>`, or, for integrations, `jfdevelops add addon <name>`, and keep them current with `jfdevelops skills sync`.
