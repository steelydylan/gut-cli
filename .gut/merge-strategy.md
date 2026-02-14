# Merge Strategy

## General Rules

- Prefer combining both changes when possible
- Keep all new features from both branches
- Preserve backward compatibility

## Priority

When changes directly conflict:

1. Prefer changes that add new functionality over deletions
2. Prefer more complete implementations
3. Prefer changes with better error handling

## File-specific Rules

### TypeScript/JavaScript
- Keep all imports from both sides (deduplicate if same)
- Combine type definitions
- Preserve JSDoc comments from both versions

### package.json
- Keep higher version numbers for dependencies
- Combine scripts from both sides
- Preserve all new dependencies

### Configuration files
- Combine configuration options
- Prefer more permissive settings for development

## Code Style

- Follow existing code style in the file
- Maintain consistent indentation
- Keep comments that explain "why" not "what"
