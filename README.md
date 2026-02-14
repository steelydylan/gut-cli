# gut-cli

**Git Utility Tool** - AI-powered git commands for smarter workflows.

## Installation

```bash
npm install -g gut-cli
```

## Commands

All AI commands support short aliases (without `ai-` prefix):

| Command | Alias | Description |
|---------|-------|-------------|
| `gut ai-commit` | `gut commit` | Generate commit messages |
| `gut ai-pr` | `gut pr` | Generate PR descriptions |
| `gut ai-review` | `gut review` | Code review |
| `gut ai-diff` | `gut diff` | Explain changes |
| `gut ai-merge` | `gut merge` | Resolve merge conflicts |
| `gut changelog` | - | Generate changelogs |

### `gut commit`

Generate commit messages using AI.

```bash
# Generate commit message (auto-stages if nothing staged)
gut commit

# Auto-commit with generated message
gut commit --commit

# Force stage all changes
gut commit --all

# Use specific provider
gut commit --provider openai
```

**Commit Convention Support**: If a convention file exists in your repo, gut will follow it:
- `.gut/commit-convention.md`
- `.github/commit-convention.md`
- `.commit-convention.md`
- `.gitmessage`

### `gut pr`

Generate pull request title and description using AI.

```bash
# Generate PR description
gut pr

# Specify base branch
gut pr --base develop

# Create PR directly (requires gh CLI)
gut pr --create

# Copy to clipboard
gut pr --copy
```

**PR Template Support**: Automatically uses `.github/pull_request_template.md` if present.

### `gut review`

Get AI code review of your changes or GitHub PRs.

```bash
# Review all uncommitted changes
gut review

# Review staged changes only
gut review --staged

# Review specific commit
gut review --commit abc123

# Review a GitHub PR by number
gut review 123

# Output as JSON
gut review --json
```

### `gut diff`

Get an AI-powered explanation of your changes.

```bash
# Explain all uncommitted changes
gut diff

# Explain staged changes only
gut diff --staged

# Explain specific commit
gut diff --commit abc123

# Output as JSON
gut diff --json
```

### `gut merge`

Merge branches with AI-powered conflict resolution.

```bash
# Merge a branch with AI conflict resolution
gut merge feature/login

# Use specific provider
gut merge feature/login --provider openai

# Don't auto-commit after resolving
gut merge feature/login --no-commit
```

### `gut changelog`

Generate a changelog from commits.

```bash
# Generate changelog for last 10 commits
gut changelog

# Generate changelog between refs
gut changelog v1.0.0 v1.1.0

# Generate changelog since a tag
gut changelog --tag v1.0.0

# Output as JSON
gut changelog --json
```

**Changelog Template Support**: If `CHANGELOG.md` exists, gut will match its style.

### `gut cleanup`

Delete merged branches safely.

```bash
# Show merged branches that can be deleted
gut cleanup --dry-run

# Delete all merged local branches (with confirmation)
gut cleanup

# Also delete remote branches
gut cleanup --remote

# Skip confirmation prompt
gut cleanup --force
```

### `gut auth`

Manage API keys for AI providers.

```bash
# Save API key to system keychain
gut auth login --provider gemini

# Check which providers are configured
gut auth status

# Remove API key
gut auth logout --provider gemini
```

**Supported providers**: `gemini` (default), `openai`, `anthropic`

API keys can also be set via environment variables:
- `GUT_GEMINI_API_KEY` or `GEMINI_API_KEY`
- `GUT_OPENAI_API_KEY` or `OPENAI_API_KEY`
- `GUT_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`

## Project Configuration

gut looks for these configuration files in your repository:

| File | Purpose |
|------|---------|
| `.gut/commit-convention.md` | Custom commit message rules |
| `.gut/pr-template.md` | PR description template |
| `.gut/changelog-template.md` | Changelog style template |
| `.gut/merge-strategy.md` | Merge conflict resolution rules |
| `.github/pull_request_template.md` | PR template (fallback) |
| `CHANGELOG.md` | Changelog style (fallback) |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Link for local testing
npm link
```

## Related

Prefer a GUI? Check out [Gitton](https://jsers.dev/service/gitton) - a modern Git client for desktop.

## License

MIT
