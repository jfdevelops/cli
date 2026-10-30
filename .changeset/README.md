# Changesets

Every pull request that changes CLI behavior needs a changeset describing the release impact. Run `pnpm changeset`, choose the bump, and write a user-facing summary. Changes with no release impact, such as CI, tooling, or internal documentation, use `pnpm changeset --empty`.

Merging to `main` lets the release workflow open or update a `chore(release): version packages` pull request that applies pending changesets to `package.json` and `CHANGELOG.md`. Publishing is not configured while the package is private.
