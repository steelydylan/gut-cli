import { describe, it, expect, vi, } from 'vitest'
import { MockLanguageModelV1 } from 'ai/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Mock credentials
vi.mock('./credentials.js', () => ({
  getApiKey: vi.fn(() => 'test-api-key'),
  Provider: {}
}))

// Mock config
vi.mock('./config.js', () => ({
  getConfiguredModel: vi.fn(() => undefined),
  getDefaultModel: vi.fn((provider: string) => {
    const models: Record<string, string> = {
      gemini: 'gemini-2.5-flash',
      openai: 'gpt-4.1-mini',
      anthropic: 'claude-sonnet-4-5',
      ollama: 'llama3.3'
    }
    return models[provider] || models.gemini
  })
}))

// Mock AI SDK's generateText and generateObject with MockLanguageModelV1
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: 'feat(test): add new feature'
  })
})

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: vi.fn(async ({ prompt }) => {
      const result = await mockModel.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
      })
      return { text: result.text || '' }
    }),
    generateObject: vi.fn(async () => ({
      object: {
        summary: 'Test summary',
        issues: [],
        positives: ['Good code'],
        // For changelog
        date: '2024-01-01',
        sections: [{ type: 'Added', items: ['New feature'] }],
        // For explanation
        purpose: 'Test purpose',
        changes: [{ file: 'test.ts', description: 'Test change' }],
        impact: 'Test impact',
        notes: [],
        // For search
        matches: [{ hash: 'abc1234', reason: 'Matches query' }],
        // For work summary
        title: 'Test title',
        overview: 'Test overview',
        highlights: ['Highlight 1'],
        details: [{ category: 'Feature', items: ['Item 1'] }],
        stats: { commits: 1 },
        // For conflict resolution
        resolvedContent: 'resolved content',
        explanation: 'Combined both changes',
        strategy: 'combined'
      }
    }))
  }
})

// Mock provider SDKs to avoid actual API calls
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => () => mockModel)
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => () => mockModel)
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => () => mockModel)
}))

vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => () => mockModel)
}))

// Import actual functions to test
import {
  findTemplate,
  findGlobalTemplate,
  generateCommitMessage,
  generatePRDescription,
  generateCodeReview,
  generateChangelog,
  generateExplanation,
  searchCommits,
  generateBranchName,
  generateBranchNameFromDiff,
  generateStashName,
  generateWorkSummary,
  resolveConflict,
  generateGitignore
} from './ai.js'

describe('findTemplate', () => {
  it('should return null when no template exists', () => {
    const result = findTemplate('/nonexistent/path', 'commit')
    expect(result).toBeNull()
  })

  it('should find project-level template', () => {
    const repoRoot = process.cwd()
    const result = findTemplate(repoRoot, 'commit')

    expect(result).not.toBeNull()
    expect(result).toContain('commit')
  })
})

describe('findGlobalTemplate', () => {
  it('should return null when no global template exists', () => {
    const result = findGlobalTemplate('nonexistent-template')
    expect(result).toBeNull()
  })
})

describe('generateCommitMessage', () => {
  it('should generate a commit message from diff', async () => {
    const diff = `diff --git a/src/feature.ts b/src/feature.ts
new file mode 100644
+export const feature = true;`

    const result = await generateCommitMessage(diff, { provider: 'gemini' })

    expect(result).toBe('feat(test): add new feature')
  })

  it('should accept custom template', async () => {
    const diff = 'some diff'
    const template = 'Custom template: generate a commit message'

    const result = await generateCommitMessage(diff, { provider: 'gemini' }, template)

    expect(result).toBe('feat(test): add new feature')
  })

  it('should work with different providers', async () => {
    const diff = 'some diff'

    const geminiResult = await generateCommitMessage(diff, { provider: 'gemini' })
    const openaiResult = await generateCommitMessage(diff, { provider: 'openai' })
    const anthropicResult = await generateCommitMessage(diff, { provider: 'anthropic' })

    expect(geminiResult).toBe('feat(test): add new feature')
    expect(openaiResult).toBe('feat(test): add new feature')
    expect(anthropicResult).toBe('feat(test): add new feature')
  })
})

describe('generatePRDescription', () => {
  it('should generate PR title and body', async () => {
    const context = {
      baseBranch: 'main',
      currentBranch: 'feature/test',
      commits: ['feat: add feature', 'fix: bug fix'],
      diff: 'some diff content'
    }

    const result = await generatePRDescription(context, { provider: 'gemini' })

    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('body')
  })
})

describe('generateCodeReview', () => {
  it('should generate code review with issues and positives', async () => {
    const diff = `diff --git a/src/feature.ts b/src/feature.ts
+const password = "hardcoded";`

    const result = await generateCodeReview(diff, { provider: 'gemini' })

    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('issues')
    expect(result).toHaveProperty('positives')
    expect(Array.isArray(result.issues)).toBe(true)
    expect(Array.isArray(result.positives)).toBe(true)
  })
})

describe('generateChangelog', () => {
  it('should generate changelog from commits', async () => {
    const context = {
      commits: [
        { hash: 'abc123', message: 'feat: add feature', author: 'test', date: '2024-01-01' },
        { hash: 'def456', message: 'fix: bug fix', author: 'test', date: '2024-01-02' }
      ],
      diff: 'some diff',
      fromRef: 'v1.0.0',
      toRef: 'HEAD'
    }

    const result = await generateChangelog(context, { provider: 'gemini' })

    expect(result).toHaveProperty('date')
    expect(result).toHaveProperty('sections')
    expect(Array.isArray(result.sections)).toBe(true)
  })
})

describe('generateExplanation', () => {
  it('should generate explanation for commit', async () => {
    const context = {
      type: 'commit' as const,
      title: 'feat: add feature',
      diff: 'some diff',
      metadata: { hash: 'abc123', author: 'test', date: '2024-01-01' }
    }

    const result = await generateExplanation(context, { provider: 'gemini' })

    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('purpose')
    expect(result).toHaveProperty('changes')
    expect(result).toHaveProperty('impact')
  })

  it('should generate explanation for file content', async () => {
    const context = {
      type: 'file-content' as const,
      title: 'feature.ts',
      content: 'export const feature = true;',
      metadata: { filePath: 'src/feature.ts' }
    }

    const result = await generateExplanation(context, { provider: 'gemini' })

    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('purpose')
  })

  it('should generate explanation for PR', async () => {
    const context = {
      type: 'pr' as const,
      title: 'Add new feature',
      diff: 'some diff',
      metadata: {
        prNumber: '123',
        baseBranch: 'main',
        headBranch: 'feature/test',
        commits: ['feat: add feature']
      }
    }

    const result = await generateExplanation(context, { provider: 'gemini' })

    expect(result).toHaveProperty('summary')
  })
})

describe('searchCommits', () => {
  it('should search commits and return matches', async () => {
    const commits = [
      { hash: 'abc1234567890', message: 'feat: add login', author: 'test', email: 'test@test.com', date: '2024-01-01' },
      { hash: 'def4567890123', message: 'fix: auth bug', author: 'test', email: 'test@test.com', date: '2024-01-02' }
    ]

    const result = await searchCommits('login feature', commits, { provider: 'gemini' })

    expect(result).toHaveProperty('matches')
    expect(Array.isArray(result.matches)).toBe(true)
  })
})

describe('generateBranchName', () => {
  it('should generate branch name from description', async () => {
    const result = await generateBranchName('add user authentication', { provider: 'gemini' })

    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should accept context with type and issue', async () => {
    const result = await generateBranchName(
      'fix login bug',
      { provider: 'gemini' },
      { type: 'fix', issue: 'ISSUE-123' }
    )

    expect(typeof result).toBe('string')
  })
})

describe('generateBranchNameFromDiff', () => {
  it('should generate branch name from diff', async () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
+export const login = () => {}`

    const result = await generateBranchNameFromDiff(diff, { provider: 'gemini' })

    expect(typeof result).toBe('string')
  })
})

describe('generateStashName', () => {
  it('should generate stash name from diff', async () => {
    const diff = `diff --git a/src/feature.ts b/src/feature.ts
+export const feature = true;`

    const result = await generateStashName(diff, { provider: 'gemini' })

    expect(typeof result).toBe('string')
  })
})

describe('generateWorkSummary', () => {
  it('should generate work summary from commits', async () => {
    const context = {
      commits: [
        { hash: 'abc123', message: 'feat: add feature', date: '2024-01-01' },
        { hash: 'def456', message: 'fix: bug fix', date: '2024-01-01' }
      ],
      author: 'Test User',
      since: '2024-01-01'
    }

    const result = await generateWorkSummary(context, { provider: 'gemini' })

    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('overview')
    expect(result).toHaveProperty('highlights')
    expect(result).toHaveProperty('details')
    expect(result).toHaveProperty('stats')
    // commits count comes from context.commits.length in actual implementation
    expect(result.stats?.commits).toBeGreaterThan(0)
  })

  it('should support different formats', async () => {
    const context = {
      commits: [{ hash: 'abc123', message: 'feat: test', date: '2024-01-01' }],
      author: 'Test User',
      since: '2024-01-01'
    }

    const dailyResult = await generateWorkSummary(context, { provider: 'gemini' }, 'daily')
    const weeklyResult = await generateWorkSummary(context, { provider: 'gemini' }, 'weekly')

    expect(dailyResult).toHaveProperty('title')
    expect(weeklyResult).toHaveProperty('title')
  })
})

describe('resolveConflict', () => {
  it('should resolve merge conflict', async () => {
    const conflictedContent = `<<<<<<< HEAD
const value = 1;
=======
const value = 2;
>>>>>>> feature`

    const context = {
      filename: 'src/file.ts',
      oursRef: 'HEAD',
      theirsRef: 'feature'
    }

    const result = await resolveConflict(conflictedContent, context, { provider: 'gemini' })

    expect(result).toHaveProperty('resolvedContent')
    expect(result).toHaveProperty('explanation')
    expect(result).toHaveProperty('strategy')
    expect(['ours', 'theirs', 'combined', 'rewritten']).toContain(result.strategy)
  })
})

describe('generateGitignore', () => {
  it('should generate gitignore content', async () => {
    const context = {
      files: 'node_modules/\npackage.json\ntsconfig.json\nsrc/',
      configFiles: 'package.json\ntsconfig.json'
    }

    const result = await generateGitignore(context, { provider: 'gemini' })

    expect(typeof result).toBe('string')
  })

  it('should consider existing gitignore', async () => {
    const context = {
      files: 'node_modules/\ndist/',
      existingGitignore: 'node_modules/'
    }

    const result = await generateGitignore(context, { provider: 'gemini' })

    expect(typeof result).toBe('string')
  })
})

describe('template content', () => {
  const templatesDir = join(process.cwd(), '.gut')
  const jaTemplatesDir = join(templatesDir, 'ja')

  const templateFiles = [
    'commit.md',
    'pr.md',
    'review.md',
    'branch.md',
    'changelog.md',
    'checkout.md',
    'explain.md',
    'explain-file.md',
    'find.md',
    'gitignore.md',
    'merge.md',
    'stash.md',
    'summary.md'
  ]

  describe('English templates', () => {
    templateFiles.forEach(file => {
      it(`should have ${file} template`, () => {
        const templatePath = join(templatesDir, file)
        expect(existsSync(templatePath)).toBe(true)

        const content = readFileSync(templatePath, 'utf-8')
        expect(content.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Japanese templates', () => {
    templateFiles.forEach(file => {
      it(`should have ${file} Japanese template`, () => {
        const templatePath = join(jaTemplatesDir, file)
        expect(existsSync(templatePath)).toBe(true)

        const content = readFileSync(templatePath, 'utf-8')
        expect(content.length).toBeGreaterThan(0)
      })
    })
  })

  describe('template consistency', () => {
    templateFiles.forEach(file => {
      it(`English and Japanese ${file} should have similar structure`, () => {
        const enPath = join(templatesDir, file)
        const jaPath = join(jaTemplatesDir, file)

        const enContent = readFileSync(enPath, 'utf-8')
        const jaContent = readFileSync(jaPath, 'utf-8')

        expect(enContent.length).toBeGreaterThan(0)
        expect(jaContent.length).toBeGreaterThan(0)

        const enHeadings = (enContent.match(/^## /gm) || []).length
        const jaHeadings = (jaContent.match(/^## /gm) || []).length
        expect(jaHeadings).toBe(enHeadings)
      })
    })
  })
})
