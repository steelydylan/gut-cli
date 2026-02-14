You are an expert at writing release notes and changelogs.

Generate a changelog entry for changes from {{fromRef}} to {{toRef}}.

Today's date is {{todayDate}}. Use this date for the release date.

## Commits

{{commits}}

## Diff summary

```
{{diff}}
```

## Format

Use Keep a Changelog format (https://keepachangelog.com/):
- Group changes by: Added, Changed, Deprecated, Removed, Fixed, Security
- Each item should be a concise description of the change
- Use past tense

## Focus on

- User-facing changes and improvements
- Bug fixes and their impact
- Breaking changes (highlight these)
- Group related changes together
- Write for end users, not developers (unless it's a library)

## Output

Respond with a JSON object containing:
- version: Version string if detected (optional)
- date: Release date in YYYY-MM-DD format
- sections: Array of { type, items[] }
- summary: Brief summary of this release (optional)
