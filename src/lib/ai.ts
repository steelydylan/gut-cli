import { generateText, generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { getApiKey, type Provider } from './credentials.js'
import { type Language, getConfiguredModel, getDefaultModel } from './config.js'

export type { Language }

export interface AIOptions {
  provider: Provider
  model?: string
  ollamaBaseUrl?: string // For Ollama provider
  apiKey?: string // Optional: directly provide API key (bypasses keytar/env lookup)
  language?: Language // Language for AI responses ('en' | 'ja')
}

// Get the directory where gut is installed (for reading default templates)
// Works for both CLI (dist/index.js) and library (dist/lib/index.js) entry points
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function findGutRoot(): string {
  // Search upward from __dirname until we find a directory containing .gut/
  let current = __dirname
  for (let i = 0; i < 5; i++) {
    const gutPath = join(current, '.gut')
    if (existsSync(gutPath)) {
      return current
    }
    current = dirname(current)
  }
  // Fallback: assume we're in dist/lib/ or dist/
  return join(__dirname, '..')
}

const GUT_ROOT = findGutRoot()

/**
 * Load a default template from gut's own .gut/ folder
 */
function loadTemplate(name: string): string {
  const templatePath = join(GUT_ROOT, '.gut', `${name}.md`)
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
  }
  throw new Error(`Template not found: ${templatePath}`)
}

/**
 * Get the global templates directory path
 */
function getGlobalTemplatesDir(): string {
  return join(homedir(), '.config', 'gut', 'templates')
}

/**
 * Find a global template from ~/.config/gut/templates/
 * @param templateName - Name of the template file (without .md extension)
 * @returns Template content if found, null otherwise
 */
export function findGlobalTemplate(templateName: string): string | null {
  const templatePath = join(getGlobalTemplatesDir(), `${templateName}.md`)
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
  }
  return null
}

/**
 * Find a user's project template from .gut/ folder
 * @param repoRoot - The root directory of the user's repository
 * @param templateName - Name of the template file (without .md extension)
 * @returns Template content if found, null otherwise
 */
export function findTemplate(repoRoot: string, templateName: string): string | null {
  // Priority 1: Project-level template (.gut/)
  const projectTemplatePath = join(repoRoot, '.gut', `${templateName}.md`)
  if (existsSync(projectTemplatePath)) {
    return readFileSync(projectTemplatePath, 'utf-8')
  }

  // Priority 2: Global template (~/.config/gut/templates/)
  const globalTemplate = findGlobalTemplate(templateName)
  if (globalTemplate) {
    return globalTemplate
  }

  return null
}

/**
 * Build a prompt with context in XML format and instructions from template.
 * Templates don't need to include variables - context is automatically prepended.
 * Output format instructions are also injected automatically, so templates remain pure instructions.
 *
 * @param userTemplate - User-provided template string or null/undefined
 * @param templateName - Name of the default template file in .gut/ (without .md extension)
 * @param context - Context data to include (diff, commits, etc.)
 * @param language - Language for AI responses
 * @param outputFormat - Output format instructions (auto-injected, not user-editable)
 * @returns Complete prompt with XML context and instructions
 */
function buildPrompt(
  userTemplate: string | null | undefined,
  templateName: string,
  context: Record<string, string | undefined>,
  language?: Language,
  outputFormat?: string
): string {
  // Build XML context
  let contextXml = '<context>\n'
  for (const [key, value] of Object.entries(context)) {
    if (value) {
      contextXml += `<${key}>\n${value}\n</${key}>\n`
    }
  }
  contextXml += '</context>\n\n'

  // Get template (user template takes priority)
  const template = userTemplate || loadTemplate(templateName)

  // Build language instruction
  const langInstruction = language === 'ja'
    ? '\n\nIMPORTANT: Respond in Japanese (日本語で回答してください).'
    : ''

  // Build output format section (auto-injected, not user-editable)
  const outputSection = outputFormat
    ? `\n\n<output-format>\n${outputFormat}\n</output-format>`
    : ''

  return `${contextXml}<instructions>\n${template}${langInstruction}\n</instructions>${outputSection}`
}

async function getModel(options: AIOptions) {
  // Priority: options.model > config model > default model
  const modelName = options.model || getConfiguredModel() || getDefaultModel(options.provider)

  // Helper to get API key: use provided key or fall back to keytar/env
  async function resolveApiKey(): Promise<string | null> {
    if (options.apiKey) return options.apiKey
    return getApiKey(options.provider)
  }

  // Ollama doesn't require an API key
  if (options.provider !== 'ollama') {
    const apiKey = await resolveApiKey()
    if (!apiKey) {
      throw new Error(
        `No API key found for ${options.provider}. Run: gut auth login --provider ${options.provider}`
      )
    }
  }

  switch (options.provider) {
    case 'gemini': {
      const apiKey = await resolveApiKey()
      const google = createGoogleGenerativeAI({ apiKey: apiKey! })
      return google(modelName)
    }
    case 'openai': {
      const apiKey = await resolveApiKey()
      const openai = createOpenAI({ apiKey: apiKey! })
      return openai(modelName)
    }
    case 'anthropic': {
      const apiKey = await resolveApiKey()
      const anthropic = createAnthropic({ apiKey: apiKey! })
      return anthropic(modelName)
    }
    case 'ollama': {
      const ollama = createOllama({
        baseURL: options.ollamaBaseUrl || 'http://localhost:11434/api'
      })
      return ollama(modelName)
    }
  }
}

export async function generateCommitMessage(
  diff: string,
  options: AIOptions,
  template?: string
): Promise<string> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'commit', {
    diff: diff.slice(0, 8000)
  }, options.language, 'Respond with ONLY the commit message, nothing else.')

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
  },
  options: AIOptions,
  template?: string
): Promise<{ title: string; body: string }> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'pr', {
    baseBranch: context.baseBranch,
    currentBranch: context.currentBranch,
    commits: context.commits.map((c) => `- ${c}`).join('\n'),
    diff: context.diff.slice(0, 6000)
  }, options.language, `Respond in JSON format:
\`\`\`json
{
  "title": "...",
  "body": "..."
}
\`\`\``)

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
  options: AIOptions,
  template?: string
): Promise<CodeReview> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'review', {
    diff: diff.slice(0, 10000)
  }, options.language)

  const result = await generateObject({
    model,
    schema: CodeReviewSchema,
    prompt
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
  },
  options: AIOptions,
  template?: string
): Promise<Changelog> {
  const model = await getModel(options)

  const commitList = context.commits
    .map((c) => `- ${c.hash.slice(0, 7)} ${c.message} (${c.author})`)
    .join('\n')

  const prompt = buildPrompt(template, 'changelog', {
    fromRef: context.fromRef,
    toRef: context.toRef,
    commits: commitList,
    diff: context.diff.slice(0, 8000),
    todayDate: new Date().toISOString().split('T')[0]
  }, options.language)

  const result = await generateObject({
    model,
    schema: ChangelogSchema,
    prompt
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
  template?: string
): Promise<Explanation> {
  const model = await getModel(options)

  // Handle file content explanation
  if (context.type === 'file-content') {
    const prompt = buildPrompt(template, 'explain-file', {
      filePath: context.metadata.filePath || '',
      content: context.content?.slice(0, 15000) || ''
    }, options.language)

    const result = await generateObject({
      model,
      schema: ExplanationSchema,
      prompt
    })
    return result.object
  }

  // Build context info for diff-based explanations
  let contextInfo: string
  let targetType: string

  if (context.type === 'pr') {
    contextInfo = `Pull Request: #${context.metadata.prNumber}
Title: ${context.title}
Branch: ${context.metadata.headBranch} -> ${context.metadata.baseBranch}
Commits:
${context.metadata.commits?.map((c) => `- ${c}`).join('\n') || 'N/A'}`
    targetType = 'pull request'
  } else if (context.type === 'file-history') {
    contextInfo = `File: ${context.metadata.filePath}
Recent commits:
${context.metadata.commits?.map((c) => `- ${c}`).join('\n') || 'N/A'}
Latest author: ${context.metadata.author}
Latest date: ${context.metadata.date}`
    targetType = 'file changes'
  } else if (context.type === 'uncommitted' || context.type === 'staged') {
    contextInfo = context.type === 'staged' ? 'Staged changes (ready to commit)' : 'Uncommitted changes (work in progress)'
    targetType = context.type === 'staged' ? 'staged changes' : 'uncommitted changes'
  } else {
    contextInfo = `Commit: ${context.metadata.hash?.slice(0, 7)}
Message: ${context.title}
Author: ${context.metadata.author}
Date: ${context.metadata.date}`
    targetType = 'commit'
  }

  const prompt = buildPrompt(template, 'explain', {
    targetType,
    contextInfo,
    diff: context.diff?.slice(0, 12000) || ''
  }, options.language)

  const result = await generateObject({
    model,
    schema: ExplanationSchema,
    prompt
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
  template?: string
): Promise<CommitSearchResult> {
  const model = await getModel(options)

  const commitList = commits
    .map((c) => `${c.hash.slice(0, 7)} | ${c.author} | ${c.date.split('T')[0]} | ${c.message.split('\n')[0]}`)
    .join('\n')

  const prompt = buildPrompt(template, 'find', {
    query,
    commits: commitList,
    maxResults: String(maxResults)
  }, options.language)

  const result = await generateObject({
    model,
    schema: CommitSearchSchema,
    prompt
  })

  // Enrich results with full commit data and assign relevance based on position
  const enrichedMatches = result.object.matches.map((match, index) => {
    const commit = commits.find((c) => c.hash.startsWith(match.hash))
    if (!commit) {
      return null
    }
    const relevance: 'high' | 'medium' | 'low' = index === 0 ? 'high' : index < 3 ? 'medium' : 'low'
    return {
      hash: commit.hash,
      message: commit.message,
      author: commit.author,
      email: commit.email,
      date: commit.date,
      reason: match.reason,
      relevance
    }
  }).filter((m): m is NonNullable<typeof m> => m !== null)

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
  },
  template?: string
): Promise<string> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'branch', {
    description,
    type: context?.type,
    issue: context?.issue
  }, options.language, 'Respond with ONLY the branch name, nothing else.')

  const result = await generateText({
    model,
    prompt,
    maxTokens: 100
  })

  return result.text.trim().replace(/[^a-zA-Z0-9/_-]/g, '')
}

export async function generateBranchNameFromDiff(
  diff: string,
  options: AIOptions,
  template?: string | null
): Promise<string> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'checkout', {
    diff: diff.slice(0, 8000)
  }, options.language, 'Respond with ONLY the branch name, nothing else.')

  const result = await generateText({
    model,
    prompt,
    maxTokens: 100
  })

  return result.text.trim().replace(/[^a-zA-Z0-9/_-]/g, '')
}

export async function generateStashName(
  diff: string,
  options: AIOptions,
  template?: string
): Promise<string> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'stash', {
    diff: diff.slice(0, 4000)
  }, options.language, 'Respond with ONLY the stash name, nothing else.')

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
  format: 'daily' | 'weekly' | 'custom' = 'custom',
  template?: string
): Promise<WorkSummary> {
  const model = await getModel(options)

  const commitList = context.commits
    .map((c) => `- ${c.hash.slice(0, 7)} ${c.message.split('\n')[0]} (${c.date.split('T')[0]})`)
    .join('\n')

  const formatHint = format === 'daily'
    ? 'This is a daily report. Focus on today\'s accomplishments.'
    : format === 'weekly'
    ? 'This is a weekly report. Summarize the week\'s work at a higher level.'
    : `This is a summary from ${context.since}${context.until ? ` to ${context.until}` : ''}.`

  const period = `${context.since}${context.until ? ` to ${context.until}` : ' to now'}`

  const prompt = buildPrompt(template, 'summary', {
    author: context.author,
    period,
    format: formatHint,
    commits: commitList,
    diff: context.diff?.slice(0, 6000)
  }, options.language)

  const result = await generateObject({
    model,
    schema: WorkSummarySchema,
    prompt
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
  template?: string
): Promise<ConflictResolution> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'merge', {
    filename: context.filename,
    oursRef: context.oursRef,
    theirsRef: context.theirsRef,
    content: conflictedContent
  }, options.language)

  const result = await generateObject({
    model,
    schema: ConflictResolutionSchema,
    prompt
  })

  return result.object
}

export async function generateGitignore(
  context: {
    files: string
    configFiles?: string
    existingGitignore?: string
  },
  options: AIOptions,
  template?: string
): Promise<string> {
  const model = await getModel(options)

  const prompt = buildPrompt(template, 'gitignore', {
    files: context.files,
    configFiles: context.configFiles,
    existingGitignore: context.existingGitignore
  }, options.language, 'Respond with ONLY the .gitignore content, nothing else. No explanations or markdown code blocks.')

  const result = await generateText({
    model,
    prompt,
    maxTokens: 2000
  })

  return result.text.trim()
}
