# @gitton/gut

**Git Utility Tool** - AI-powered git commands for smarter workflows.

## Installation

```bash
npm install -g @gitton/gut
```

## Commands

### AI-Powered Commands

#### `gut ai-commit`

Generate commit messages using AI.

```bash
# Generate commit message for staged changes
gut ai-commit

# Auto-commit with generated message
gut ai-commit --commit

# Stage all and generate
gut ai-commit --all

# Use specific provider
gut ai-commit --provider openai
```

#### `gut ai-pr`

Generate pull request title and description using AI.

```bash
# Generate PR description
gut ai-pr

# Specify base branch
gut ai-pr --base develop

# Create PR directly (requires gh CLI)
gut ai-pr --create

# Copy to clipboard
gut ai-pr --copy
```

Supports PR templates: automatically uses `.github/pull_request_template.md` if present.

#### `gut ai-review`

Get AI code review of your changes.

```bash
# Review all uncommitted changes
gut ai-review

# Review staged changes only
gut ai-review --staged

# Review specific commit
gut ai-review --commit abc123

# Output as JSON
gut ai-review --json
```

#### `gut ai-diff`

Get an AI-powered explanation of your changes.

```bash
# Explain all uncommitted changes
gut ai-diff

# Explain staged changes only
gut ai-diff --staged

# Explain specific commit
gut ai-diff --commit abc123

# Output as JSON
gut ai-diff --json
```

### Authentication

#### `gut auth`

Manage API keys for AI providers.

```bash
# Save API key to system keychain
gut auth login --provider gemini

# Check which providers are configured
gut auth status

# Remove API key
gut auth logout --provider gemini
```

Supported providers: `gemini`, `openai`, `anthropic`

API keys can also be set via environment variables:
- `GUT_GEMINI_API_KEY` or `GEMINI_API_KEY`
- `GUT_OPENAI_API_KEY` or `OPENAI_API_KEY`
- `GUT_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`

#### `gut ai-merge`

Merge branches with AI-powered conflict resolution.

```bash
# Merge a branch with AI conflict resolution
gut ai-merge feature/login

# Use specific provider
gut ai-merge feature/login --provider openai

# Don't auto-commit after resolving
gut ai-merge feature/login --no-commit
```

### Branch Management

#### `gut cleanup`

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

## License

MIT
