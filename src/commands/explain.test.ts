import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createTestRepo, type TestGitRepo, aiMocks, credentialsMocks } from '../test/setup.js'

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  generateExplanation: vi.fn(() => Promise.resolve({
    summary: 'This commit adds a new feature',
    purpose: 'To improve functionality',
    changes: [{ file: 'feature.ts', description: 'New feature file' }],
    impact: 'Adds new capability',
    notes: ['Consider adding tests']
  })),
  findTemplate: vi.fn(aiMocks.findTemplate)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

import { generateExplanation } from '../lib/ai.js'

describe('explain command - git operations', () => {
  let repo: TestGitRepo

  beforeEach(async () => {
    repo = await createTestRepo('explain')
  })

  afterEach(() => {
    repo.cleanup()
    vi.clearAllMocks()
  })

  describe('explain commit', () => {
    it('should get commit info for explanation', async () => {
      repo.writeFile('feature.ts', 'export const feature = true;\n')
      await repo.git.add('feature.ts')
      await repo.git.commit('feat: add new feature')

      const log = await repo.git.log({ maxCount: 1 })
      const commit = log.latest!

      expect(commit.message).toBe('feat: add new feature')
      expect(commit.author_name).toBe('Test User')
    })

    it('should get diff for commit', async () => {
      repo.writeFile('diff-test.ts', 'const x = 1;\n')
      await repo.git.add('diff-test.ts')
      await repo.git.commit('test commit')

      const log = await repo.git.log({ maxCount: 1 })
      const diff = await repo.git.show([log.latest!.hash, '--format='])

      expect(diff).toContain('diff-test.ts')
    })
  })

  describe('explain uncommitted changes', () => {
    it('should get diff of uncommitted changes', async () => {
      repo.writeFile('uncommitted.ts', 'uncommitted content\n')
      await repo.git.add('uncommitted.ts')

      const diff = await repo.git.diff(['--cached'])
      expect(diff).toContain('uncommitted.ts')
    })

    it('should get diff of unstaged changes', async () => {
      repo.writeFile('README.md', '# Updated\n')

      const diff = await repo.git.diff()
      expect(diff).toContain('README.md')
    })
  })

  describe('explain file', () => {
    it('should read file content', async () => {
      const content = 'export function myFunction() {\n  return true;\n}\n'
      const filePath = repo.writeFile('myfile.ts', content)

      const fileContent = readFileSync(filePath, 'utf-8')
      expect(fileContent).toBe(content)
    })

    it('should get file history', async () => {
      repo.writeFile('history.ts', 'v1\n')
      await repo.git.add('history.ts')
      await repo.git.commit('v1')

      repo.writeFile('history.ts', 'v2\n')
      await repo.git.add('history.ts')
      await repo.git.commit('v2')

      const log = await repo.git.log({ file: 'history.ts' })
      expect(log.all.length).toBe(2)
    })
  })

  describe('explanation generation', () => {
    it('should generate explanation for commit', async () => {
      const explanation = await generateExplanation({
        type: 'commit',
        title: 'feat: add feature',
        diff: 'diff content',
        metadata: { hash: 'abc123', author: 'test', date: '2024-01-01' }
      }, { provider: 'gemini' })

      expect(explanation.summary).toContain('feature')
      expect(explanation.changes).toHaveLength(1)
    })
  })
})
