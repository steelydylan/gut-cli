import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiMocks, createTestRepo, credentialsMocks, type TestGitRepo } from '../test/setup.js'

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  generateChangelog: vi.fn(() =>
    Promise.resolve({
      version: '1.0.0',
      date: '2024-01-01',
      sections: [
        { type: 'Added', items: ['New feature'] },
        { type: 'Fixed', items: ['Bug fix'] }
      ],
      summary: 'Release summary'
    })
  ),
  findTemplate: vi.fn(aiMocks.findTemplate)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

import { generateChangelog } from '../lib/ai.js'

describe('changelog command - git operations', () => {
  let repo: TestGitRepo

  beforeEach(async () => {
    repo = await createTestRepo('changelog')
  })

  afterEach(() => {
    repo.cleanup()
    vi.clearAllMocks()
  })

  describe('commit history for changelog', () => {
    it('should get commits between refs', async () => {
      // Create multiple commits
      repo.writeFile('v1.ts', 'v1\n')
      await repo.git.add('v1.ts')
      await repo.git.commit('feat: add v1')

      repo.writeFile('v2.ts', 'v2\n')
      await repo.git.add('v2.ts')
      await repo.git.commit('fix: bug in v1')

      repo.writeFile('v3.ts', 'v3\n')
      await repo.git.add('v3.ts')
      await repo.git.commit('feat: add v3')

      const log = await repo.git.log({ from: 'HEAD~3', to: 'HEAD' })
      expect(log.all.length).toBe(3)
    })

    it('should get commits since tag', async () => {
      repo.writeFile('tagged.ts', 'tagged\n')
      await repo.git.add('tagged.ts')
      await repo.git.commit('Release v1.0.0')
      await repo.git.addTag('v1.0.0')

      repo.writeFile('after-tag.ts', 'after\n')
      await repo.git.add('after-tag.ts')
      await repo.git.commit('feat: after tag')

      const log = await repo.git.log({ from: 'v1.0.0', to: 'HEAD' })
      expect(log.all.length).toBe(1)
      expect(log.all[0].message).toBe('feat: after tag')
    })
  })

  describe('changelog generation', () => {
    it('should generate changelog from commits', async () => {
      repo.writeFile('feature.ts', 'feature\n')
      await repo.git.add('feature.ts')
      await repo.git.commit('feat: new feature')

      const log = await repo.git.log({ maxCount: 2 })
      const commits = log.all.map((c) => ({
        hash: c.hash,
        message: c.message,
        author: c.author_name,
        date: c.date
      }))

      const diff = await repo.git.diff(['HEAD~1', 'HEAD'])

      const changelog = await generateChangelog(
        {
          commits,
          diff,
          fromRef: 'HEAD~1',
          toRef: 'HEAD'
        },
        { provider: 'gemini' }
      )

      expect(changelog.version).toBe('1.0.0')
      expect(changelog.sections).toHaveLength(2)
    })
  })

  describe('tag operations', () => {
    it('should list tags', async () => {
      await repo.git.addTag('v0.1.0')
      await repo.git.addTag('v0.2.0')

      const tags = await repo.git.tags()
      expect(tags.all).toContain('v0.1.0')
      expect(tags.all).toContain('v0.2.0')
    })

    it('should get latest tag', async () => {
      await repo.git.addTag('v1.0.0')

      repo.writeFile('new.ts', 'new\n')
      await repo.git.add('new.ts')
      await repo.git.commit('new commit')

      await repo.git.addTag('v1.1.0')

      const tags = await repo.git.tags()
      expect(tags.latest).toBe('v1.1.0')
    })
  })
})
