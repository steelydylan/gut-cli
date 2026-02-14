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
  options: AIOptions
): Promise<string> {
  const model = await getModel(options)

  const prompt = `You are an expert at writing git commit messages following the Conventional Commits specification.

Analyze the following git diff and generate a concise, meaningful commit message.

Rules:
- Use format: <type>(<scope>): <description>
- Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
- Scope is optional but helpful
- Description should be lowercase, imperative mood, no period at end
- Keep the first line under 72 characters
- If changes are complex, add a blank line and bullet points for details

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
