import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestRepo, credentialsMocks, type TestGitRepo } from '../test/setup.js'

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

describe('cleanup command - git operations', () => {
  let repo: TestGitRepo

  beforeEach(async () => {
    repo = await createTestRepo('cleanup')
  })

  afterEach(() => {
    repo.cleanup()
    vi.clearAllMocks()
  })

  describe('merged branch detection', () => {
    it('should detect merged branches', async () => {
      // Create and merge a branch
      await repo.git.checkoutLocalBranch('feature/merged')
      repo.writeFile('merged.ts', 'merged\n')
      await repo.git.add('merged.ts')
      await repo.git.commit('Add merged feature')

      await repo.git.checkout('main')
      await repo.git.merge(['feature/merged'])

      // Get merged branches (excluding main)
      const merged = await repo.git.branch(['--merged', 'main'])
      expect(merged.all).toContain('feature/merged')
    })

    it('should exclude current branch', async () => {
      const branches = await repo.git.branchLocal()
      expect(branches.current).toBe('main')
    })
  })

  describe('branch deletion', () => {
    it('should delete merged branch', async () => {
      // Create and merge
      await repo.git.checkoutLocalBranch('feature/to-delete')
      repo.writeFile('delete.ts', 'delete\n')
      await repo.git.add('delete.ts')
      await repo.git.commit('Delete commit')

      await repo.git.checkout('main')
      await repo.git.merge(['feature/to-delete'])

      // Delete
      await repo.git.deleteLocalBranch('feature/to-delete')

      const branches = await repo.git.branchLocal()
      expect(branches.all).not.toContain('feature/to-delete')
    })

    it('should not delete unmerged branch without force', async () => {
      await repo.git.checkoutLocalBranch('feature/unmerged')
      repo.writeFile('unmerged.ts', 'unmerged\n')
      await repo.git.add('unmerged.ts')
      await repo.git.commit('Unmerged commit')

      await repo.git.checkout('main')

      // Should fail without force
      await expect(repo.git.deleteLocalBranch('feature/unmerged')).rejects.toThrow()
    })

    it('should force delete unmerged branch', async () => {
      await repo.git.checkoutLocalBranch('feature/force-delete')
      repo.writeFile('force.ts', 'force\n')
      await repo.git.add('force.ts')
      await repo.git.commit('Force commit')

      await repo.git.checkout('main')

      // Force delete
      await repo.git.deleteLocalBranch('feature/force-delete', true)

      const branches = await repo.git.branchLocal()
      expect(branches.all).not.toContain('feature/force-delete')
    })
  })

  describe('branch listing', () => {
    it('should list all local branches', async () => {
      await repo.git.checkoutLocalBranch('feature/a')
      await repo.git.checkout('main')
      await repo.git.checkoutLocalBranch('feature/b')
      await repo.git.checkout('main')

      const branches = await repo.git.branchLocal()
      expect(branches.all).toContain('main')
      expect(branches.all).toContain('feature/a')
      expect(branches.all).toContain('feature/b')
    })
  })
})
