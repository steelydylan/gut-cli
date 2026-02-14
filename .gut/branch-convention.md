# Branch Naming Convention

Use the following format:

```
<type>/<issue>-<short-description>
```

## Types

- `feature`: New feature or command
- `fix`: Bug fix
- `hotfix`: Urgent production fix
- `chore`: Maintenance tasks
- `refactor`: Code refactoring
- `docs`: Documentation changes

## Rules

- Use kebab-case for description
- Include issue number when available
- Keep total length under 50 characters
- Use lowercase only

## Examples

```
feature/123-add-user-auth
fix/456-handle-empty-diff
hotfix/789-crash-on-startup
chore/update-dependencies
refactor/extract-ai-logic
```

## Without Issue Number

When no issue is provided, omit the number:

```
feature/add-user-auth
fix/handle-empty-diff
```
