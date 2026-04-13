---
name: github
description: >-
  GitHub workflows using the GitHub CLI (gh). Use when the user asks for PRs,
  issues, releases, Actions, repo settings, forks, gists, or any GitHub.com task
  that can be done from the terminal; prefer gh over ad-hoc curl or guessing REST
  paths when a local shell is available.
---

# GitHub (GitHub CLI)

## Default tool

Use the **GitHub CLI (`gh`)** for GitHub-related work whenever the environment has shell access. Prefer `gh` subcommands and `gh api` over hand-built `curl` to GitHub’s REST API, unless `gh` cannot express the call.

Run commands from the relevant git repository root when the task is about the current project so `gh` resolves the correct remote and default repository.

## Preconditions

1. **`gh` installed**: If a command fails with “command not found”, say that `gh` is required and point to https://cli.github.com/
2. **Authentication**: Before write operations or private data, use `gh auth status`. If not logged in, run `gh auth login` (or instruct the user to do so in their environment).

## Command map (common tasks)

| Goal | Prefer |
|------|--------|
| Current branch’s PR | `gh pr view`, `gh pr status` |
| List / search PRs | `gh pr list`, `gh pr list --search '...'` |
| Create PR | `gh pr create` (after push) |
| PR checks / mergeability | `gh pr checks`, `gh pr view --json ...` |
| Issues | `gh issue list`, `gh issue view`, `gh issue create` |
| Actions / workflow runs | `gh run list`, `gh run view`, `gh workflow run` |
| Releases / tags | `gh release list`, `gh release create` |
| Repo metadata | `gh repo view`, `gh api repos/{owner}/{repo}` |
| API not wrapped by a subcommand | `gh api <endpoint> [--method ...] [--input -]` |

Use `gh <command> --help` or `gh help <topic>` when flags are unclear instead of guessing URLs.

## Practices

- Prefer **JSON** for machine parsing: `gh pr view 123 --json title,state,url,commits,files` etc.
- For **large output**, combine with sensible limits (`--limit`, query params via `gh api`).
- Keep **connector vs local** clear: this skill is about **local `gh` + `git`**; do not assume a separate GitHub MCP unless the user has one configured.
- **Destructive or irreversible** actions (merge, delete branch, delete release): confirm intent matches the user request; use the narrowest `gh` invocation.

## Output

Summarize what was queried or changed, with links (`html_url` / `url` from JSON when helpful) and next steps if something is blocked on auth or missing scope.
