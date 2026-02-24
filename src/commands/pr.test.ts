import { MockLanguageModelV1 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called')
})

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// Mock ora spinner
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    text: ''
  }))
}))

// Mock readline for confirmation prompts
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_prompt: string, callback: (answer: string) => void) => callback('n')),
    close: vi.fn()
  }))
}))

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}))

// Create mock model for generateObject (returns JSON string)
const mockModel = new MockLanguageModelV1({
  defaultObjectGenerationMode: 'json',
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: JSON.stringify({
      title: 'feat: Add new feature',
      body: '## Summary\n\nThis PR adds a new feature.\n\n## Changes\n\n- Added feature X'
    })
  })
})

// Mock provider SDKs to use MockLanguageModelV1
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

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(() => Promise.resolve('gemini')),
  getApiKey: vi.fn(() => 'test-api-key')
}))

// Mock config
vi.mock('../lib/config.js', () => ({
  getConfiguredModel: vi.fn(() => undefined),
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash'),
  getLanguage: vi.fn(() => 'en')
}))

// Mock gh CLI check
vi.mock('../lib/gh.js', () => ({
  isGhCliInstalled: vi.fn(() => false),
  getDefaultBranch: vi.fn(() => null),
  getExistingPrUrl: vi.fn(() => null),
  hasUpstreamBranch: vi.fn(() => true),
  pushBranchToOrigin: vi.fn()
}))

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  branch: vi.fn(() =>
    Promise.resolve({
      current: 'feature/new-feature',
      all: ['main', 'feature/new-feature']
    })
  ),
  log: vi.fn(() =>
    Promise.resolve({
      all: [
        { message: 'feat: add feature X', hash: 'abc123' },
        { message: 'fix: fix bug Y', hash: 'def456' }
      ]
    })
  ),
  diff: vi.fn(() => Promise.resolve('diff content'))
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { prCommand } from './pr.js'

describe('prCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.branch.mockResolvedValue({
      current: 'feature/new-feature',
      all: ['main', 'feature/new-feature']
    })
    mockGit.log.mockResolvedValue({
      all: [{ message: 'feat: add feature X', hash: 'abc123' }]
    })
    mockGit.diff.mockResolvedValue('diff content')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('PR description generation', () => {
    it('should generate PR title and description', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await prCommand.parseAsync([], { from: 'user' })

      expect(mockGit.branch).toHaveBeenCalled()
      expect(mockGit.log).toHaveBeenCalled()
      expect(mockGit.diff).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should use specified base branch with --base flag', async () => {
      await prCommand.parseAsync(['--base', 'develop'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith({ from: 'develop', to: 'feature/new-feature' })
    })
  })

  describe('clipboard support', () => {
    it('should copy to clipboard with --copy flag', async () => {
      const { execSync } = await import('node:child_process')

      await prCommand.parseAsync(['--copy'], { from: 'user' })

      expect(execSync).toHaveBeenCalledWith('pbcopy', expect.any(Object))
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(prCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should exit when no commits found', async () => {
      mockGit.log.mockResolvedValue({ all: [] })

      await expect(prCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await prCommand.parseAsync(['-p', 'openai'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('openai')
    })
  })

  describe('gh CLI integration', () => {
    it('should show warning when gh CLI not installed', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await prCommand.parseAsync([], { from: 'user' })

      const warningCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('gh')
      )
      expect(warningCall).toBeDefined()
    })

    it('should display PR URL after successful creation', async () => {
      const { isGhCliInstalled } = await import('../lib/gh.js')
      const { execSync } = await import('node:child_process')
      const readline = await import('node:readline')

      // Mock gh CLI as installed
      vi.mocked(isGhCliInstalled).mockReturnValue(true)

      // Mock user confirms PR creation
      vi.mocked(readline.createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, callback: (answer: string) => void) => callback('y')),
        close: vi.fn()
      } as unknown as ReturnType<typeof readline.createInterface>)

      // Mock gh pr create returning PR URL
      const prUrl = 'https://github.com/owner/repo/pull/123'
      vi.mocked(execSync).mockReturnValue(Buffer.from(prUrl))

      const consoleSpy = vi.spyOn(console, 'log')

      await prCommand.parseAsync([], { from: 'user' })

      // Verify gh pr create was called
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('gh pr create'),
        expect.any(Object)
      )

      // Verify PR URL was displayed
      const urlCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes(prUrl)
      )
      expect(urlCall).toBeDefined()
    })

    it('should prompt to push when no upstream branch exists', async () => {
      const { isGhCliInstalled, hasUpstreamBranch, pushBranchToOrigin } = await import(
        '../lib/gh.js'
      )
      const readline = await import('node:readline')

      // Mock gh CLI as installed but no upstream branch
      vi.mocked(isGhCliInstalled).mockReturnValue(true)
      vi.mocked(hasUpstreamBranch).mockReturnValue(false)

      // Mock user confirms push, then confirms PR creation
      let callCount = 0
      vi.mocked(readline.createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, callback: (answer: string) => void) => {
          callCount++
          callback('y')
        }),
        close: vi.fn()
      } as unknown as ReturnType<typeof readline.createInterface>)

      await prCommand.parseAsync([], { from: 'user' })

      // Verify push was called
      expect(pushBranchToOrigin).toHaveBeenCalledWith('feature/new-feature')
    })

    it('should abort when user declines to push', async () => {
      const { isGhCliInstalled, hasUpstreamBranch, pushBranchToOrigin } = await import(
        '../lib/gh.js'
      )
      const readline = await import('node:readline')

      vi.mocked(isGhCliInstalled).mockReturnValue(true)
      vi.mocked(hasUpstreamBranch).mockReturnValue(false)

      // Mock user declines push
      vi.mocked(readline.createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, callback: (answer: string) => void) => callback('n')),
        close: vi.fn()
      } as unknown as ReturnType<typeof readline.createInterface>)

      const consoleSpy = vi.spyOn(console, 'log')

      await prCommand.parseAsync([], { from: 'user' })

      // Verify push was not called
      expect(pushBranchToOrigin).not.toHaveBeenCalled()

      // Verify abort message was displayed
      const abortCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Aborted')
      )
      expect(abortCall).toBeDefined()
    })

    it('should update existing PR instead of creating new one', async () => {
      const { isGhCliInstalled, getExistingPrUrl } = await import('../lib/gh.js')
      const { execSync } = await import('node:child_process')
      const readline = await import('node:readline')

      // Mock gh CLI as installed
      vi.mocked(isGhCliInstalled).mockReturnValue(true)

      // Mock existing PR
      const existingPrUrl = 'https://github.com/owner/repo/pull/456'
      vi.mocked(getExistingPrUrl).mockReturnValue(existingPrUrl)

      // Mock user confirms PR update
      vi.mocked(readline.createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, callback: (answer: string) => void) => callback('y')),
        close: vi.fn()
      } as unknown as ReturnType<typeof readline.createInterface>)

      // Mock gh pr edit
      vi.mocked(execSync).mockReturnValue(Buffer.from(''))

      const consoleSpy = vi.spyOn(console, 'log')

      await prCommand.parseAsync([], { from: 'user' })

      // Verify gh pr edit was called (not create)
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('gh pr edit'),
        expect.any(Object)
      )

      // Verify existing PR URL was displayed
      const urlCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes(existingPrUrl)
      )
      expect(urlCall).toBeDefined()
    })
  })
})
