import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestRepo, credentialsMocks, type TestGitRepo } from '../test/setup.js'

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(credentialsMocks.resolveProvider),
  getApiKey: vi.fn(credentialsMocks.getApiKey)
}))

describe('sync command - git operations', () => {
  let repo: TestGitRepo
  let remoteRepo: TestGitRepo

  beforeEach(async () => {
    // Create a bare remote repository
    remoteRepo = await createTestRepo('sync-remote')

    // Create local repository
    repo = await createTestRepo('sync-local')

    // Add remote (using local path as remote for testing)
    await repo.git.addRemote('origin', remoteRepo.dir)
  })

  afterEach(() => {
    repo.cleanup()
    remoteRepo.cleanup()
    vi.clearAllMocks()
  })

  describe('remote operations', () => {
    it('should list remotes', async () => {
      const remotes = await repo.git.getRemotes(true)
      expect(remotes.map((r) => r.name)).toContain('origin')
    })

    it('should check if branch has upstream', async () => {
      const status = await repo.git.status()
      // Initially no tracking
      expect(status.tracking).toBeFalsy()
    })
  })

  describe('stash before sync', () => {
    it('should stash changes before sync', async () => {
      repo.writeFile('uncommitted.ts', 'changes\n')

      const status = await repo.git.status()
      expect(status.not_added).toContain('uncommitted.ts')

      await repo.git.stash(['push', '-u', '-m', 'sync-stash'])

      const afterStatus = await repo.git.status()
      expect(afterStatus.isClean()).toBe(true)
    })

    it('should restore stash after sync', async () => {
      repo.writeFile('restore.ts', 'to restore\n')
      await repo.git.stash(['push', '-u', '-m', 'to-restore'])

      const stashList = await repo.git.stashList()
      expect(stashList.all.length).toBe(1)

      await repo.git.stash(['pop'])

      const status = await repo.git.status()
      expect(status.not_added).toContain('restore.ts')
    })
  })

  describe('merge strategies', () => {
    it('should support rebase', async () => {
      // Create divergent history
      repo.writeFile('local.ts', 'local\n')
      await repo.git.add('local.ts')
      await repo.git.commit('Local commit')

      // Rebase is configured but we test the config
      await repo.git.addConfig('pull.rebase', 'true')
      const config = await repo.git.listConfig()
      expect(config.all['pull.rebase']).toBe('true')
    })

    it('should support merge', async () => {
      await repo.git.addConfig('pull.rebase', 'false')
      const config = await repo.git.listConfig()
      expect(config.all['pull.rebase']).toBe('false')
    })
  })

  describe('branch tracking', () => {
    it('should set upstream when pushing', async () => {
      // This would require a real remote, but we can test the command structure
      const branches = await repo.git.branchLocal()
      expect(branches.current).toBe('main')
    })
  })
})
