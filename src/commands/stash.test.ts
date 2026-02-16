import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createTestRepo, type TestGitRepo, aiMocks, credentialsMocks } from '../test/setup.js'

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  generateStashName: vi.fn(aiMocks.generateStashName),
  findTemplate: vi.fn(aiMocks.findTemplate)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

import { generateStashName } from '../lib/ai.js'

describe('stash command - git operations', () => {
  let repo: TestGitRepo

  beforeEach(async () => {
    repo = await createTestRepo('stash')
  })

  afterEach(() => {
    repo.cleanup()
    vi.clearAllMocks()
  })

  describe('stash name generation', () => {
    it('should generate stash name from diff', async () => {
      const diff = 'diff --git a/auth.ts\n+export function login() {}'
      const stashName = await generateStashName(diff, { provider: 'gemini' })

      expect(stashName).toBe('WIP: test changes')
      expect(generateStashName).toHaveBeenCalledWith(diff, { provider: 'gemini' })
    })
  })

  describe('stash creation', () => {
    it('should stash modified files', async () => {
      repo.writeFile('README.md', '# Updated Test\n')

      let status = await repo.git.status()
      expect(status.modified).toContain('README.md')

      await repo.git.stash(['push', '-m', 'WIP: test stash'])

      status = await repo.git.status()
      expect(status.isClean()).toBe(true)

      const stashList = await repo.git.stashList()
      expect(stashList.all.length).toBe(1)
      expect(stashList.all[0].message).toContain('WIP: test stash')
    })

    it('should stash untracked files with -u flag', async () => {
      repo.writeFile('untracked.ts', 'new file\n')

      let status = await repo.git.status()
      expect(status.not_added).toContain('untracked.ts')

      await repo.git.stash(['push', '-u', '-m', 'WIP: with untracked'])

      status = await repo.git.status()
      expect(status.isClean()).toBe(true)
    })
  })

  describe('stash operations', () => {
    beforeEach(async () => {
      repo.writeFile('README.md', '# Modified\n')
      await repo.git.stash(['push', '-m', 'WIP: first stash'])

      repo.writeFile('README.md', '# Modified again\n')
      await repo.git.stash(['push', '-m', 'WIP: second stash'])
    })

    it('should list all stashes', async () => {
      const stashList = await repo.git.stashList()
      expect(stashList.all.length).toBe(2)
    })

    it('should apply stash without removing it', async () => {
      await repo.git.stash(['apply', 'stash@{0}'])

      const status = await repo.git.status()
      expect(status.modified).toContain('README.md')

      const stashList = await repo.git.stashList()
      expect(stashList.all.length).toBe(2)
    })

    it('should pop stash and remove it', async () => {
      await repo.git.stash(['pop', 'stash@{0}'])

      const status = await repo.git.status()
      expect(status.modified).toContain('README.md')

      const stashList = await repo.git.stashList()
      expect(stashList.all.length).toBe(1)
    })

    it('should drop specific stash', async () => {
      await repo.git.stash(['drop', 'stash@{0}'])

      const stashList = await repo.git.stashList()
      expect(stashList.all.length).toBe(1)
    })

    it('should clear all stashes', async () => {
      await repo.git.stash(['clear'])

      const stashList = await repo.git.stashList()
      expect(stashList.all.length).toBe(0)
    })
  })

  describe('stash content preservation', () => {
    it('should preserve file content after stash pop', async () => {
      const content = 'const important = "data";\n'
      const filePath = repo.writeFile('important.ts', content)

      await repo.git.add('important.ts')
      await repo.git.stash(['push', '-m', 'WIP: important changes'])

      expect((await repo.git.status()).isClean()).toBe(true)

      await repo.git.stash(['pop'])
      const restored = readFileSync(filePath, 'utf-8')
      expect(restored).toBe(content)
    })
  })
})
