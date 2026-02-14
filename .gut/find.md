# Project Context for Commit Search

This is gut-cli, an AI-powered Git utility tool.

## Key Features

- AI-powered commit messages (gut commit)
- PR description generation (gut pr)
- Code review (gut review)
- Merge conflict resolution (gut merge)
- Change explanations (gut explain)
- Commit search (gut find)
- Branch name generation (gut branch)
- Changelog generation (gut changelog)

## Common Commit Patterns

- `feat(*)`: New commands or features
- `fix(*)`: Bug fixes
- `refactor(ai)`: AI library changes
- `chore(release)`: Version releases

## Architecture

- Commands are in `src/commands/`
- AI logic is in `src/lib/ai.ts`
- Credentials in `src/lib/credentials.ts`
