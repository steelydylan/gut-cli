# gut - Git Utility Tool

AI-powered Git CLI tool that enhances common Git workflows.

## Architecture

```
src/
├── index.ts           # CLI entry point (Commander.js)
├── commands/          # CLI commands
│   ├── ai-commit.ts   # Generate commit messages with AI
│   ├── ai-pr.ts       # Generate PR descriptions
│   ├── ai-review.ts   # AI code review
│   ├── ai-diff.ts     # Explain diffs with AI
│   ├── ai-merge.ts    # AI-assisted merge conflict resolution
│   ├── ai-explain.ts  # Explain commits, PRs, or files
│   ├── changelog.ts   # Generate changelogs
│   ├── cleanup.ts     # Branch cleanup utilities
│   └── auth.ts        # API key management
└── lib/
    ├── ai.ts          # AI provider abstraction (Gemini, OpenAI, Anthropic)
    └── credentials.ts # Secure credential storage (keytar)
```

## Key Patterns

- **Multi-provider AI**: Supports Gemini, OpenAI, and Anthropic via AI SDK
- **Project-specific config**: `.gut/` directory for conventions and templates
- **Lazy imports**: Heavy dependencies (keytar) loaded only when needed
- **Structured output**: Uses Zod schemas with `generateObject` for reliable AI responses

## Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `ai-commit` | `commit` | Generate commit message from staged changes |
| `ai-pr` | `pr` | Generate PR title and description |
| `ai-review` | `review` | Review code changes |
| `ai-diff` | `diff` | Explain changes in plain language |
| `ai-merge` | `merge` | Resolve merge conflicts with AI |
| `ai-explain` | `explain` | Explain commits, PRs, or file contents |
| `changelog` | - | Generate changelog from commits |
| `cleanup` | - | Clean up merged branches |
| `auth` | - | Manage API keys |

## Configuration Files

- `.gut/commit-convention.md` - Commit message format
- `.gut/pr-template.md` - PR description template
- `.gut/merge-strategy.md` - Merge conflict resolution preferences
- `.gut/explain.md` - Project context for explanations
- `.gut/changelog-template.md` - Changelog format
