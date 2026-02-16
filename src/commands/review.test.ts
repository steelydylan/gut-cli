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
    info: vi.fn().mockReturnThis(),
    text: ''
  }))
}))

// Create mock model for generateObject (returns JSON string)
const mockModel = new MockLanguageModelV1({
  defaultObjectGenerationMode: 'json',
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: JSON.stringify({
      summary: 'Code looks good overall',
      issues: [
        { severity: 'warning', file: 'test.ts', line: 10, message: 'Consider adding types' }
      ],
      positives: ['Good test coverage']
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
  getApiKey: vi.fn(() => 'test-api-key'),
  Provider: {}
}))

// Mock config
vi.mock('../lib/config.js', () => ({
  getConfiguredModel: vi.fn(() => undefined),
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash')
}))

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  diff: vi.fn(() => Promise.resolve('diff content')),
  status: vi.fn(() => Promise.resolve({ staged: ['file.ts'] }))
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { reviewCommand } from './review.js'

describe('reviewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.diff.mockResolvedValue('diff --git a/file.ts\n+new content')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('reviewing uncommitted changes', () => {
    it('should review all uncommitted changes by default', async () => {
      mockGit.diff
        .mockResolvedValueOnce('unstaged diff') // First call: unstaged
        .mockResolvedValueOnce('staged diff') // Second call: staged

      await reviewCommand.parseAsync([], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalled()
    })
  })

  describe('reviewing staged changes', () => {
    it('should review only staged changes with --staged flag', async () => {
      mockGit.diff.mockResolvedValue('staged diff content')

      await reviewCommand.parseAsync(['--staged'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalledWith(['--cached'])
    })
  })

  describe('reviewing specific commit', () => {
    it('should review specific commit with --commit flag', async () => {
      const commitHash = 'abc1234'
      mockGit.diff.mockResolvedValue('commit diff')

      await reviewCommand.parseAsync(['--commit', commitHash], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalledWith([`${commitHash}^`, commitHash])
    })
  })

  describe('JSON output', () => {
    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await reviewCommand.parseAsync(['--json'], { from: 'user' })

      // Check that JSON.stringify was used (contains "summary")
      const calls = consoleSpy.mock.calls
      const jsonCall = calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('summary')
      )
      expect(jsonCall).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(reviewCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should handle no changes to review', async () => {
      mockGit.diff.mockResolvedValue('')

      await expect(reviewCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(0)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await reviewCommand.parseAsync(['-p', 'anthropic'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('anthropic')
    })
  })
})
