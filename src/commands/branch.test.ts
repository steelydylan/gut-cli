import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiMocks, createTestRepo, credentialsMocks, type TestGitRepo } from '../test/setup.js'

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  generateBranchName: vi.fn(aiMocks.generateBranchName),
  generateBranchNameFromDiff: vi.fn(aiMocks.generateBranchNameFromDiff),
  findTemplate: vi.fn(aiMocks.findTemplate)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

import { generateBranchName, generateBranchNameFromDiff } from '../lib/ai.js'

describe('branch command - git operations', () => {
  let repo: TestGitRepo

  beforeEach(async () => {
    repo = await createTestRepo('branch')
  })

  afterEach(() => {
    repo.cleanup()
    vi.clearAllMocks()
  })

  describe('branch name generation', () => {
    it('should generate branch name from description', async () => {
      const description = 'Add user authentication with OAuth'
      const branchName = await generateBranchName(description, { provider: 'gemini' })

      expect(branchName).toBe('feature/test-branch')
      expect(generateBranchName).toHaveBeenCalledWith(description, { provider: 'gemini' })
    })

    it('should generate branch name from diff', async () => {
      repo.writeFile('config.ts', 'export const config = {};\n')

      const diff = 'diff --git a/config.ts b/config.ts\n+export const config = {};'
      const branchName = await generateBranchNameFromDiff(diff, { provider: 'gemini' })

      expect(branchName).toBe('feature/from-diff')
    })
  })

  describe('branch creation', () => {
    it('should create a new branch', async () => {
      const branchName = 'feature/new-feature'
      await repo.git.checkoutLocalBranch(branchName)

      const branches = await repo.git.branchLocal()
      expect(branches.all).toContain(branchName)
      expect(branches.current).toBe(branchName)
    })

    it('should not allow duplicate branch names', async () => {
      const branchName = 'feature/existing'
      await repo.git.checkoutLocalBranch(branchName)
      await repo.git.checkout('main')

      await expect(repo.git.checkoutLocalBranch(branchName)).rejects.toThrow()
    })

    it('should switch between branches', async () => {
      await repo.git.checkoutLocalBranch('feature/branch-a')
      expect((await repo.git.branchLocal()).current).toBe('feature/branch-a')

      await repo.git.checkout('main')
      expect((await repo.git.branchLocal()).current).toBe('main')

      await repo.git.checkoutLocalBranch('feature/branch-b')
      expect((await repo.git.branchLocal()).current).toBe('feature/branch-b')
    })
  })

  describe('branch with uncommitted changes', () => {
    it('should carry uncommitted changes to new branch', async () => {
      repo.writeFile('new-file.ts', 'content\n')

      await repo.git.checkoutLocalBranch('feature/with-changes')

      const status = await repo.git.status()
      expect(status.not_added).toContain('new-file.ts')
    })
  })

  describe('branch deletion', () => {
    it('should delete a merged branch', async () => {
      // Create and switch to new branch
      await repo.git.checkoutLocalBranch('feature/to-delete')
      repo.writeFile('temp.ts', 'temp\n')
      await repo.git.add('temp.ts')
      await repo.git.commit('temp commit')

      // Switch back and merge
      await repo.git.checkout('main')
      await repo.git.merge(['feature/to-delete'])

      // Delete branch
      await repo.git.deleteLocalBranch('feature/to-delete')

      const branches = await repo.git.branchLocal()
      expect(branches.all).not.toContain('feature/to-delete')
    })
  })
})
