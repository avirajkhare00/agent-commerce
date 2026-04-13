---
name: paperclip
description: >-
  Paperclip (paperclipai) setup and usage from the npm registry. Use when the
  user mentions Paperclip, paperclipai CLI, local Paperclip server, onboarding,
  or integrating with Paperclip APIs. Do not clone the Paperclip GitHub repo to
  obtain or run the product.
---

# Paperclip (npm-first)

## Hard rule

**Do not `git clone` the Paperclip repository** (for example `github.com/paperclipai/paperclip`) as the default way to install, run, or update Paperclip for local development or integration work.

Treat the **npm registry** as the source of truth for the CLI and published packages users actually run.

## How to get Paperclip

Prefer one of these patterns (match the user’s package manager):

- **One-off / scripts**: `pnpm dlx paperclipai`, `npx paperclipai@latest`, or `npm exec paperclipai`
- **Project dependency**: `npm install paperclipai`, `pnpm add paperclipai`, etc.
- **Global CLI** (when appropriate): `npm install -g paperclipai`

Use **`paperclipai`** as the package name on npm (see https://www.npmjs.com/package/paperclipai). Pin a version when reproducibility matters (`npx paperclipai@<version>`).

## When cloning might be acceptable

Only if the user **explicitly** asks to work on upstream Paperclip source, fork the repo, or patch core Paperclip code. Even then, prefer npm-linked or workspace workflows only if they request that level of contribution—not as a substitute for “run Paperclip locally.”

## Agent behavior

- Install and invoke via **npm/pnpm/yarn**, not submodule or clone-by-default.
- For docs, prefer **published docs / npm readme / official links** over assuming the repo layout is checked out.
- If a command fails, fix **install, auth, env, or flags**—do not pivot to cloning the monorepo as a workaround.
