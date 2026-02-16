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

// Create mock model
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: ''
  })
})

// Mock AI SDK
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateObject: vi.fn(async () => ({
      object: {
        title: 'feat: Add new feature',
        body: '## Summary\n\nThis PR adds a new feature.\n\n## Changes\n\n- Added feature X'
      }
    }))
  }
})

// Mock provider SDKs
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => () => mockModel)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(() => Promise.resolve('gemini')),
  getApiKey: vi.fn(() => 'test-api-key')
}))

// Mock config
vi.mock('../lib/config.js', () => ({
  getConfiguredModel: vi.fn(() => undefined),
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash')
}))

// Mock gh CLI check
vi.mock('../lib/gh.js', () => ({
  isGhCliInstalled: vi.fn(() => false)
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
  })
})
