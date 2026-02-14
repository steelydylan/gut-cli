import { generateText, generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { getApiKey, Provider } from './credentials.js'
import { getLanguage, getLanguageInstruction } from './config.js'

export interface AIOptions {
  provider: Provider
  model?: string
}

const DEFAULT_MODELS: Record<Provider, string> = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514'
}

async function getModel(options: AIOptions) {
  const apiKey = await getApiKey(options.provider)
  if (!apiKey) {
    throw new Error(
      `No API key found for ${options.provider}. Run: gut auth login --provider ${options.provider}`
    )
  }

  const modelName = options.model || DEFAULT_MODELS[options.provider]

  switch (options.provider) {
    case 'gemini': {
      const google = createGoogleGenerativeAI({ apiKey })
      return google(modelName)
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey })
      return openai(modelName)
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey })
      return anthropic(modelName)
    }
  }
}

export async function generateCommitMessage(
  diff: string,
  options: AIOptions,
  convention?: string
): Promise<string> {
  const model = await getModel(options)

  const conventionInstructions = convention
    ? `
IMPORTANT: Follow this project's commit message convention:

--- CONVENTION START ---
${convention}
--- CONVENTION END ---
`
    : `
Rules:
- Use format: <type>(<scope>): <description>
- Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
- Scope is optional but helpful
- Description should be lowercase, imperative mood, no period at end
- Keep the first line under 72 characters
- If changes are complex, add a blank line and bullet points for details`

  const langInstruction = getLanguageInstruction(getLanguage())

  const prompt = `You are an expert at writing git commit messages.

Analyze the following git diff and generate a concise, meaningful commit message.
${conventionInstructions}

Git diff:
\`\`\`
${diff.slice(0, 8000)}
\`\`\`

Respond with ONLY the commit message, nothing else.${langInstruction}`

  const result = await generateText({
    model,
    prompt,
    maxTokens: 500
  })

  return result.text.trim()
}

export async function generatePRDescription(
  context: {
    baseBranch: string
    currentBranch: string
    commits: string[]
    diff: string
    template?: string
  },
  options: AIOptions
): Promise<{ title: string; body: string }> {
  const model = await getModel(options)

  const templateInstructions = context.template
    ? `
IMPORTANT: The repository has a PR template. You MUST fill in this template structure:

--- PR TEMPLATE START ---
${context.template}
--- PR TEMPLATE END ---

Fill in each section of the template based on the changes. Keep the template structure intact.
Replace placeholder text and fill in the sections appropriately.`
    : `
Rules for description:
- Description should have:
  - ## Summary section with 2-3 bullet points
  - ## Changes section listing key modifications
  - ## Test Plan section (suggest what to test)`

  const langInstruction = getLanguageInstruction(getLanguage())

  const prompt = `You are an expert at writing pull request descriptions.

Generate a clear and informative PR title and description based on the following information.

Branch: ${context.currentBranch} -> ${context.baseBranch}

Commits:
${context.commits.map((c) => `- ${c}`).join('\n')}

Diff summary (truncated):
\`\`\`
${context.diff.slice(0, 6000)}
\`\`\`
${templateInstructions}

Rules for title:
- Title should be concise (under 72 chars), start with a verb

Respond in JSON format:
{
  "title": "...",
  "body": "..."
}${langInstruction}`

  const result = await generateText({
    model,
    prompt,
    maxTokens: 2000
  })

  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      title: context.currentBranch.replace(/[-_]/g, ' '),
      body: result.text
    }
  }
}

const CodeReviewSchema = z.object({
  summary: z.string().describe('Brief overall assessment'),
  issues: z.array(
    z.object({
      severity: z.enum(['critical', 'warning', 'suggestion']),
      file: z.string(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional()
    })
  ),
  positives: z.array(z.string()).describe('Good practices observed')
})

export type CodeReview = z.infer<typeof CodeReviewSchema>

export async function generateCodeReview(
  diff: string,
  options: AIOptions
): Promise<CodeReview> {
  const model = await getModel(options)

  const langInstruction = getLanguageInstruction(getLanguage())

  const result = await generateObject({
    model,
    schema: CodeReviewSchema,
    prompt: `You are an expert code reviewer. Analyze the following git diff and provide a structured review.

Focus on:
- Bugs and potential issues
- Security vulnerabilities
- Performance concerns
- Code style and best practices
- Suggestions for improvement

Git diff:
\`\`\`
${diff.slice(0, 10000)}
\`\`\`

Be constructive and specific. Include line numbers when possible.${langInstruction}`
  })

  return result.object
}

const ChangelogSchema = z.object({
  version: z.string().optional().describe('Version string if detected'),
  date: z.string().describe('Release date in YYYY-MM-DD format'),
  sections: z.array(
    z.object({
      type: z.string().describe('Section type (Added, Changed, Fixed, Removed, etc.)'),
      items: z.array(z.string()).describe('List of changes in this section')
    })
  ),
  summary: z.string().optional().describe('Brief summary of this release')
})

export type Changelog = z.infer<typeof ChangelogSchema>

export async function generateChangelog(
  context: {
    commits: Array<{ hash: string; message: string; author: string; date: string }>
    diff: string
    fromRef: string
    toRef: string
    template?: string
  },
  options: AIOptions
): Promise<Changelog> {
  const model = await getModel(options)

  const templateInstructions = context.template
    ? `
IMPORTANT: Follow this project's changelog format:

--- CHANGELOG TEMPLATE START ---
${context.template.slice(0, 2000)}
--- CHANGELOG TEMPLATE END ---

Match the style, sections, and formatting of the existing changelog.`
    : `
Use Keep a Changelog format (https://keepachangelog.com/):
- Group changes by: Added, Changed, Deprecated, Removed, Fixed, Security
- Each item should be a concise description of the change
- Use past tense`

  const commitList = context.commits
    .map((c) => `- ${c.hash.slice(0, 7)} ${c.message} (${c.author})`)
    .join('\n')

  const langInstruction = getLanguageInstruction(getLanguage())

  const result = await generateObject({
    model,
    schema: ChangelogSchema,
    prompt: `You are an expert at writing release notes and changelogs.

Generate a changelog entry for changes from ${context.fromRef} to ${context.toRef}.

Commits:
${commitList}

Diff summary (truncated):
\`\`\`
${context.diff.slice(0, 8000)}
\`\`\`
${templateInstructions}

Focus on:
- User-facing changes and improvements
- Bug fixes and their impact
- Breaking changes (highlight these)
- Group related changes together
- Write for end users, not developers (unless it's a library)${langInstruction}`
  })

  return result.object
}

const ConflictResolutionSchema = z.object({
  resolvedContent: z.string().describe('The resolved file content'),
  explanation: z.string().describe('Brief explanation of how the conflict was resolved'),
  strategy: z.enum(['ours', 'theirs', 'combined', 'rewritten']).describe('Resolution strategy used')
})

export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>

const ExplanationSchema = z.object({
  summary: z.string().describe('One-line summary of what this file/commit/PR does'),
  purpose: z.string().describe('The purpose and role of this code'),
  changes: z.array(
    z.object({
      file: z.string(),
      description: z.string().describe('Description of this file or component')
    })
  ),
  impact: z.string().describe('What impact or role this has in the project'),
  notes: z.array(z.string()).optional().describe('Important considerations or caveats')
})

export type Explanation = z.infer<typeof ExplanationSchema>

export async function generateExplanation(
  context: {
    type: 'commit' | 'pr' | 'file-history' | 'file-content' | 'uncommitted' | 'staged'
    title: string
    diff?: string
    content?: string
    metadata: {
      hash?: string
      author?: string
      date?: string
      prNumber?: string
      baseBranch?: string
      headBranch?: string
      commits?: string[]
      filePath?: string
    }
  },
  options: AIOptions,
  projectContext?: string
): Promise<Explanation> {
  const model = await getModel(options)

  const projectContextSection = projectContext
    ? `
IMPORTANT: Use this project context to provide more accurate explanations:

--- PROJECT CONTEXT START ---
${projectContext.slice(0, 4000)}
--- PROJECT CONTEXT END ---
`
    : ''

  const langInstruction = getLanguageInstruction(getLanguage())

  // Handle file content explanation (different prompt)
  if (context.type === 'file-content') {
    const result = await generateObject({
      model,
      schema: ExplanationSchema,
      prompt: `You are an expert at explaining code in a clear and insightful way.
${projectContextSection}
Analyze the following file and explain what it does, its purpose, and its role in a project.

File: ${context.metadata.filePath}

Content:
\`\`\`
${context.content?.slice(0, 15000)}
\`\`\`

Focus on:
- What this file does (main functionality)
- Its purpose and role in the codebase
- Key functions, classes, or components it defines
- Dependencies and what it interacts with
- Any important patterns or architecture decisions

Explain in a way that helps someone quickly understand this file's purpose and how it fits into the larger codebase.${langInstruction}`
    })
    return result.object
  }

  // Handle diff-based explanations (commits, PRs, file history, uncommitted, staged)
  let contextInfo: string
  let targetType: string

  if (context.type === 'pr') {
    contextInfo = `
Pull Request: #${context.metadata.prNumber}
Title: ${context.title}
Branch: ${context.metadata.headBranch} -> ${context.metadata.baseBranch}
Commits:
${context.metadata.commits?.map((c) => `- ${c}`).join('\n') || 'N/A'}
`
    targetType = 'pull request'
  } else if (context.type === 'file-history') {
    contextInfo = `
File: ${context.metadata.filePath}
Recent commits:
${context.metadata.commits?.map((c) => `- ${c}`).join('\n') || 'N/A'}
Latest author: ${context.metadata.author}
Latest date: ${context.metadata.date}
`
    targetType = 'file changes'
  } else if (context.type === 'uncommitted' || context.type === 'staged') {
    contextInfo = `
${context.type === 'staged' ? 'Staged changes (ready to commit)' : 'Uncommitted changes (work in progress)'}
`
    targetType = context.type === 'staged' ? 'staged changes' : 'uncommitted changes'
  } else {
    contextInfo = `
Commit: ${context.metadata.hash?.slice(0, 7)}
Message: ${context.title}
Author: ${context.metadata.author}
Date: ${context.metadata.date}
`
    targetType = 'commit'
  }

  const result = await generateObject({
    model,
    schema: ExplanationSchema,
    prompt: `You are an expert at explaining code changes in a clear and insightful way.
${projectContextSection}
Analyze the following ${targetType} and provide a comprehensive explanation.

${contextInfo}

Diff:
\`\`\`
${context.diff?.slice(0, 12000)}
\`\`\`

Focus on:
- What the changes accomplish (not just what files changed)
- WHY these changes were likely made
- The broader context and purpose
- Any important implications or side effects

Explain in a way that helps someone understand not just the "what" but the "why" behind these changes.${langInstruction}`
  })

  return result.object
}

const CommitSearchSchema = z.object({
  matches: z.array(
    z.object({
      hash: z.string().describe('Commit hash'),
      reason: z.string().describe('Why this commit matches the query')
    })
  ),
  summary: z.string().optional().describe('Brief summary of the search results')
})

export interface CommitSearchResult {
  matches: Array<{
    hash: string
    message: string
    author: string
    email: string
    date: string
    reason: string
    relevance?: 'high' | 'medium' | 'low'
  }>
  summary?: string
}

export async function searchCommits(
  query: string,
  commits: Array<{
    hash: string
    message: string
    author: string
    email: string
    date: string
  }>,
  options: AIOptions,
  maxResults: number = 5,
  projectContext?: string
): Promise<CommitSearchResult> {
  const model = await getModel(options)

  const projectContextSection = projectContext
    ? `
IMPORTANT: Use this project context to better understand the codebase:

--- PROJECT CONTEXT START ---
${projectContext.slice(0, 3000)}
--- PROJECT CONTEXT END ---
`
    : ''

  const commitList = commits
    .map((c) => `${c.hash.slice(0, 7)} | ${c.author} | ${c.date.split('T')[0]} | ${c.message.split('\n')[0]}`)
    .join('\n')

  const langInstruction = getLanguageInstruction(getLanguage())

  const result = await generateObject({
    model,
    schema: CommitSearchSchema,
    prompt: `You are an expert at understanding git history and finding relevant commits.
${projectContextSection}
The user is looking for commits related to: "${query}"

Here are the commits to search through:
\`\`\`
${commitList}
\`\`\`

Find the commits that best match the user's query. Consider:
- Commit messages that mention similar concepts
- Related features, bug fixes, or changes
- Semantic similarity (e.g., "login" matches "authentication")

Return up to ${maxResults} matching commits, ordered by relevance (most relevant first).
Only include commits that actually match the query - if none match well, return an empty array.

For each match, provide:
- The commit hash (first 7 characters are fine)
- A brief reason explaining why this commit matches the query${langInstruction}`
  })

  // Enrich results with full commit data
  const enrichedMatches = result.object.matches.map((match) => {
    const commit = commits.find((c) => c.hash.startsWith(match.hash))
    if (!commit) {
      return null
    }
    return {
      hash: commit.hash,
      message: commit.message,
      author: commit.author,
      email: commit.email,
      date: commit.date,
      reason: match.reason,
      relevance: 'high' as const // First results are most relevant
    }
  }).filter((m): m is NonNullable<typeof m> => m !== null)

  // Assign relevance based on position
  enrichedMatches.forEach((match, index) => {
    if (index === 0) match.relevance = 'high'
    else if (index < 3) match.relevance = 'medium'
    else match.relevance = 'low'
  })

  return {
    matches: enrichedMatches,
    summary: result.object.summary
  }
}

export async function generateBranchName(
  description: string,
  options: AIOptions,
  context?: {
    type?: string
    issue?: string
    convention?: string | null
  }
): Promise<string> {
  const model = await getModel(options)

  const conventionInstructions = context?.convention
    ? `
IMPORTANT: Follow this project's branch naming convention:

--- CONVENTION START ---
${context.convention}
--- CONVENTION END ---
`
    : `
Rules:
- Use format: <type>/<short-description>
- Types: feature, fix, hotfix, chore, refactor, docs, test
- Use kebab-case for description
- Keep it short (under 50 chars total)
- No special characters except hyphens and slashes`

  const typeHint = context?.type ? `\nBranch type: ${context.type}` : ''
  const issueHint = context?.issue ? `\nInclude issue number: ${context.issue}` : ''

  const prompt = `You are an expert at creating git branch names.

Generate a clean, descriptive branch name for the following:

Description: ${description}
${typeHint}
${issueHint}
${conventionInstructions}

Respond with ONLY the branch name, nothing else.`

  const result = await generateText({
    model,
    prompt,
    maxTokens: 100
  })

  return result.text.trim().replace(/[^a-zA-Z0-9/_-]/g, '')
}

export async function generateStashName(
  diff: string,
  options: AIOptions
): Promise<string> {
  const model = await getModel(options)

  const prompt = `You are an expert at summarizing code changes.

Generate a short, descriptive stash name for the following changes.

Rules:
- Start with "WIP: " prefix
- Keep it under 50 characters total
- Be specific about what the changes do
- Use present tense

Diff:
\`\`\`
${diff.slice(0, 4000)}
\`\`\`

Respond with ONLY the stash name, nothing else.`

  const result = await generateText({
    model,
    prompt,
    maxTokens: 100
  })

  return result.text.trim()
}

const WorkSummarySchema = z.object({
  title: z.string().describe('One-line title for the summary'),
  overview: z.string().describe('Brief overview of what was accomplished'),
  highlights: z.array(z.string()).describe('Key accomplishments or highlights'),
  details: z.array(
    z.object({
      category: z.string().describe('Category (e.g., Feature, Bug Fix, Refactor)'),
      items: z.array(z.string()).describe('List of items in this category')
    })
  ),
  stats: z.object({
    commits: z.number(),
    filesChanged: z.number().optional(),
    additions: z.number().optional(),
    deletions: z.number().optional()
  }).optional()
})

export type WorkSummary = z.infer<typeof WorkSummarySchema>

export async function generateWorkSummary(
  context: {
    commits: Array<{ hash: string; message: string; date: string }>
    author: string
    since: string
    until?: string
    diff?: string
  },
  options: AIOptions,
  format: 'daily' | 'weekly' | 'custom' = 'custom'
): Promise<WorkSummary> {
  const model = await getModel(options)

  const commitList = context.commits
    .map((c) => `- ${c.hash.slice(0, 7)} ${c.message.split('\n')[0]} (${c.date.split('T')[0]})`)
    .join('\n')

  const langInstruction = getLanguageInstruction(getLanguage())

  const formatHint = format === 'daily'
    ? 'This is a daily report. Focus on today\'s accomplishments.'
    : format === 'weekly'
    ? 'This is a weekly report. Summarize the week\'s work at a higher level.'
    : `This is a summary from ${context.since}${context.until ? ` to ${context.until}` : ''}.`

  const result = await generateObject({
    model,
    schema: WorkSummarySchema,
    prompt: `You are an expert at writing work summaries and reports.

Generate a clear, professional work summary for the following git activity.

Author: ${context.author}
Period: ${context.since}${context.until ? ` to ${context.until}` : ' to now'}
${formatHint}

Commits:
${commitList}

${context.diff ? `
Diff summary (truncated):
\`\`\`
${context.diff.slice(0, 6000)}
\`\`\`
` : ''}

Focus on:
- What was accomplished (not just listing commits)
- Group related work together
- Highlight important achievements
- Use clear, non-technical language where possible
- Make it suitable for sharing with team or manager${langInstruction}`
  })

  return {
    ...result.object,
    stats: {
      commits: context.commits.length,
      ...result.object.stats
    }
  }
}

export async function resolveConflict(
  conflictedContent: string,
  context: {
    filename: string
    oursRef: string
    theirsRef: string
  },
  options: AIOptions,
  strategy?: string
): Promise<ConflictResolution> {
  const model = await getModel(options)

  const strategyInstructions = strategy
    ? `
IMPORTANT: Follow this project's merge strategy:

--- MERGE STRATEGY START ---
${strategy}
--- MERGE STRATEGY END ---
`
    : `
Rules:
- Understand the intent of both changes
- Combine changes when both are valid additions
- Choose the more complete/correct version when they conflict
- Preserve all necessary functionality`

  const result = await generateObject({
    model,
    schema: ConflictResolutionSchema,
    prompt: `You are an expert at resolving git merge conflicts intelligently.

Analyze the following conflicted file and provide a resolution.

File: ${context.filename}
Merging: ${context.theirsRef} into ${context.oursRef}

Conflicted content:
\`\`\`
${conflictedContent}
\`\`\`
${strategyInstructions}

Additional rules:
- The resolved content should be valid, working code
- Do NOT include conflict markers (<<<<<<, =======, >>>>>>)

Provide the fully resolved file content.`
  })

  return result.object
}
