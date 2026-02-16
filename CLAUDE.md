# CLAUDE.md

## Development Rules

### Adding New Features
- When adding a new command or feature, **always update README.md** to document it
- Update the command table and usage examples
- For AI-powered commands, **always add a corresponding `.gut/` template file**
  - **CRITICAL: This is mandatory. Do not forget this step.**
  - Template files use `{{variable}}` syntax for variable substitution
  - Current mappings:
    - `commit` → `.gut/commit.md`
    - `pr` → `.gut/pr.md`
    - `review` → `.gut/review.md`
    - `merge` → `.gut/merge.md`
    - `explain` → `.gut/explain.md`
    - `explain (file)` → `.gut/explain-file.md`
    - `find` → `.gut/find.md`
    - `branch` → `.gut/branch.md`
    - `checkout` → `.gut/checkout.md`
    - `changelog` → `.gut/changelog.md`
    - `stash` → `.gut/stash.md`
    - `summary` → `.gut/summary.md`
    - `gitignore` → `.gut/gitignore.md`

### Project Structure
- Commands go in `src/commands/`
- Shared AI logic goes in `src/lib/ai.ts`
  - `findTemplate(repoRoot, templateName)` - Find user's project template
  - `applyTemplate(userTemplate, templateName, variables)` - Apply variables to template
- Prompt templates go in `.gut/`

### Build & Test
```bash
npm run build   # Build with tsup
npm run lint    # Run Biome lint
npm run check   # Run Biome lint + format check
```
