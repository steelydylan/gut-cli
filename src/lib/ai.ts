import { generateText, generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { getApiKey, Provider } from './credentials.js'

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

  const prompt = `You are an expert at writing git commit messages.

Analyze the following git diff and generate a concise, meaningful commit message.
${conventionInstructions}

Git diff:
\`\`\`
${diff.slice(0, 8000)}
\`\`\`

Respond with ONLY the commit message, nothing else.`

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
}`

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

const DiffSummarySchema = z.object({
  summary: z.string().describe('Brief one-line summary of what changed'),
  changes: z.array(
    z.object({
      file: z.string(),
      description: z.string().describe('What changed in this file')
    })
  ),
  impact: z.string().describe('What impact these changes have on the codebase'),
  notes: z.array(z.string()).optional().describe('Any important notes or considerations')
})

export type DiffSummary = z.infer<typeof DiffSummarySchema>

export async function generateDiffSummary(
  diff: string,
  options: AIOptions
): Promise<DiffSummary> {
  const model = await getModel(options)

  const result = await generateObject({
    model,
    schema: DiffSummarySchema,
    prompt: `You are an expert at explaining code changes in a clear and concise way.

Analyze the following git diff and provide a human-friendly summary.

Focus on:
- What was changed and why it might have been changed
- The purpose and impact of the changes
- Any notable patterns or refactoring

Git diff:
\`\`\`
${diff.slice(0, 10000)}
\`\`\`

Explain the changes in plain language that any developer can understand.`
  })

  return result.object
}

export async function generateCodeReview(
  diff: string,
  options: AIOptions
): Promise<CodeReview> {
  const model = await getModel(options)

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

Be constructive and specific. Include line numbers when possible.`
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
- Write for end users, not developers (unless it's a library)`
  })

  return result.object
}

const ConflictResolutionSchema = z.object({
  resolvedContent: z.string().describe('The resolved file content'),
  explanation: z.string().describe('Brief explanation of how the conflict was resolved'),
  strategy: z.enum(['ours', 'theirs', 'combined', 'rewritten']).describe('Resolution strategy used')
})

export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>

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
