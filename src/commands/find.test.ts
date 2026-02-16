import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestRepo, type TestGitRepo, aiMocks, credentialsMocks } from '../test/setup.js'

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  searchCommits: vi.fn(() => Promise.resolve({
    matches: [
      { hash: 'abc1234', message: 'feat: add login', author: 'test', email: 'test@test.com', date: '2024-01-01', reason: 'Matches login query', relevance: 'high' }
    ],
    summary: 'Found 1 matching commit'
  })),
  findTemplate: vi.fn(aiMocks.findTemplate)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

import { searchCommits } from '../lib/ai.js'

describe('find command - git operations', () => {
  let repo: TestGitRepo

  beforeEach(async () => {
    repo = await createTestRepo('find')
  })

  afterEach(() => {
    repo.cleanup()
    vi.clearAllMocks()
  })

  describe('commit history retrieval', () => {
    it('should get commit log', async () => {
      repo.writeFile('file1.ts', 'a\n')
      await repo.git.add('file1.ts')
      await repo.git.commit('feat: add file1')

      repo.writeFile('file2.ts', 'b\n')
      await repo.git.add('file2.ts')
      await repo.git.commit('fix: bug in file1')

      const log = await repo.git.log({ maxCount: 10 })
      expect(log.all.length).toBe(3) // Including initial commit
    })

    it('should filter by author', async () => {
      const log = await repo.git.log({ '--author': 'Test User' })
      expect(log.all.length).toBeGreaterThan(0)
      expect(log.all.every(c => c.author_name === 'Test User')).toBe(true)
    })

    it('should filter by date', async () => {
      const log = await repo.git.log({ '--since': '1 week ago' })
      expect(log.all.length).toBeGreaterThan(0)
    })

    it('should filter by path', async () => {
      repo.writeFile('src/feature.ts', 'feature\n')
      await repo.git.add('src/feature.ts')
      await repo.git.commit('feat: add feature in src')

      repo.writeFile('docs/readme.md', 'docs\n')
      await repo.git.add('docs/readme.md')
      await repo.git.commit('docs: update readme')

      const log = await repo.git.log({ file: 'src/' })
      const messages = log.all.map(c => c.message)
      expect(messages).toContain('feat: add feature in src')
      expect(messages).not.toContain('docs: update readme')
    })
  })

  describe('commit search', () => {
    it('should search commits with AI', async () => {
      const commits = [
        { hash: 'abc123', message: 'feat: add login', author: 'test', email: 'test@test.com', date: '2024-01-01' },
        { hash: 'def456', message: 'fix: auth bug', author: 'test', email: 'test@test.com', date: '2024-01-02' }
      ]

      const result = await searchCommits('login feature', commits, { provider: 'gemini' }, 5)

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].reason).toContain('login')
    })
  })

  describe('commit details', () => {
    it('should get commit details by hash', async () => {
      repo.writeFile('detail.ts', 'detail\n')
      await repo.git.add('detail.ts')
      await repo.git.commit('feat: detailed commit')

      const log = await repo.git.log({ maxCount: 1 })
      const hash = log.latest?.hash

      const show = await repo.git.show([hash!, '--stat', '--format=%H|%an|%ae|%s'])
      expect(show).toContain(hash)
    })
  })
})
