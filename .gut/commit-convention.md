# Commit Convention

Use Conventional Commits format:

```
<type>(<scope>): <description>

[optional body]
```

## Types

- `feat`: New feature or command
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring without feature changes
- `chore`: Maintenance tasks, dependencies
- `test`: Adding or updating tests

## Scopes

- `cli`: CLI interface changes
- `commit`: gut commit command
- `review`: gut review command
- `pr`: gut pr command
- `diff`: gut diff command
- `merge`: gut merge command
- `changelog`: gut changelog command
- `auth`: Authentication related
- `ai`: AI library changes

## Examples

```
feat(changelog): add changelog generation command
fix(commit): handle empty staged changes
docs: update README with new commands
refactor(ai): extract common model initialization
```

## Rules

- Use lowercase for description
- No period at the end
- Use imperative mood ("add" not "added")
- Keep first line under 72 characters
