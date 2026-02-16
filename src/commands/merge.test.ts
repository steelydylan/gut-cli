import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiMocks, createTestRepo, credentialsMocks, type TestGitRepo } from '../test/setup.js'

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  resolveConflict: vi.fn(() =>
    Promise.resolve({
      resolvedContent: 'merged content',
      explanation: 'Combined both changes',
      strategy: 'combined'
    })
  ),
  findTemplate: vi.fn(aiMocks.findTemplate)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

describe('merge command - git operations', () => {
  let repo: TestGitRepo

  beforeEach(async () => {
    repo = await createTestRepo('merge')
  })

  afterEach(() => {
    repo.cleanup()
    vi.clearAllMocks()
  })

  describe('simple merge (no conflicts)', () => {
    it('should merge branch without conflicts', async () => {
      // Create feature branch with changes
      await repo.git.checkoutLocalBranch('feature/simple')
      repo.writeFile('feature.ts', 'export const feature = true;\n')
      await repo.git.add('feature.ts')
      await repo.git.commit('Add feature')

      // Switch back to main and merge (use --no-ff to create merge commit)
      await repo.git.checkout('main')
      await repo.git.merge(['feature/simple', '--no-ff'])

      // Verify merge
      const log = await repo.git.log({ maxCount: 1 })
      expect(log.latest?.message).toContain('Merge')
    })

    it('should fast-forward merge when possible', async () => {
      // Create feature branch
      await repo.git.checkoutLocalBranch('feature/ff')
      repo.writeFile('ff.ts', 'fast forward\n')
      await repo.git.add('ff.ts')
      await repo.git.commit('FF commit')

      // Switch to main (no changes since branch)
      await repo.git.checkout('main')

      // Fast-forward merge
      await repo.git.merge(['feature/ff', '--ff-only'])

      const log = await repo.git.log({ maxCount: 1 })
      expect(log.latest?.message).toBe('FF commit')
    })
  })

  describe('merge with conflicts', () => {
    it('should detect conflicts', async () => {
      // Create conflicting changes
      await repo.git.checkoutLocalBranch('feature/conflict')
      repo.writeFile('README.md', '# Feature branch\n')
      await repo.git.add('README.md')
      await repo.git.commit('Update README on feature')

      await repo.git.checkout('main')
      repo.writeFile('README.md', '# Main branch\n')
      await repo.git.add('README.md')
      await repo.git.commit('Update README on main')

      // Attempt merge - should fail
      try {
        await repo.git.merge(['feature/conflict'])
      } catch {
        // Expected to fail
      }

      const status = await repo.git.status()
      expect(status.conflicted).toContain('README.md')
    })

    it('should abort merge', async () => {
      // Create conflict
      await repo.git.checkoutLocalBranch('feature/abort')
      repo.writeFile('README.md', '# Abort test\n')
      await repo.git.add('README.md')
      await repo.git.commit('Abort test commit')

      await repo.git.checkout('main')
      repo.writeFile('README.md', '# Main abort\n')
      await repo.git.add('README.md')
      await repo.git.commit('Main abort commit')

      try {
        await repo.git.merge(['feature/abort'])
      } catch {
        // Expected
      }

      // Abort merge
      await repo.git.merge(['--abort'])

      const status = await repo.git.status()
      expect(status.conflicted).toHaveLength(0)
    })
  })

  describe('merge strategies', () => {
    it('should use ours strategy', async () => {
      await repo.git.checkoutLocalBranch('feature/ours')
      repo.writeFile('ours.ts', 'feature version\n')
      await repo.git.add('ours.ts')
      await repo.git.commit('Feature ours')

      await repo.git.checkout('main')
      repo.writeFile('ours.ts', 'main version\n')
      await repo.git.add('ours.ts')
      await repo.git.commit('Main ours')

      await repo.git.merge(['feature/ours', '-X', 'ours'])

      const status = await repo.git.status()
      expect(status.isClean()).toBe(true)
    })
  })
})
