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
      version: '1.0.0',
      date: '2024-01-01',
      sections: [
        { type: 'Added', items: ['New feature'] },
        { type: 'Fixed', items: ['Bug fix'] }
      ],
      summary: 'Release summary'
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
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash'),
  getLanguage: vi.fn(() => 'en'),
  getBaseUrl: vi.fn(() => undefined)
}))

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  log: vi.fn(() =>
    Promise.resolve({
      all: [
        { hash: 'abc123', message: 'feat: new feature', author_name: 'Test', date: '2024-01-01' },
        { hash: 'def456', message: 'fix: bug fix', author_name: 'Test', date: '2024-01-02' }
      ]
    })
  ),
  diff: vi.fn(() => Promise.resolve('diff content'))
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { changelogCommand } from './changelog.js'

describe('changelogCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('changelog generation', () => {
    it('should generate changelog from commits between refs', async () => {
      await changelogCommand.parseAsync(['HEAD~10', 'HEAD'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith({ from: 'HEAD~10', to: 'HEAD' })
      expect(mockGit.diff).toHaveBeenCalled()
    })

    it('should use default refs when not specified', async () => {
      await changelogCommand.parseAsync([], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith({ from: 'HEAD~10', to: 'HEAD' })
    })

    it('should generate changelog since tag with --tag option', async () => {
      await changelogCommand.parseAsync(['--tag', 'v1.0.0'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith({ from: 'v1.0.0', to: 'HEAD' })
    })
  })

  describe('output formats', () => {
    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await changelogCommand.parseAsync(['--json'], { from: 'user' })

      // Check that JSON was output
      const calls = consoleSpy.mock.calls
      const jsonCall = calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('version')
      )
      expect(jsonCall).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(changelogCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should handle no commits in range', async () => {
      mockGit.log.mockResolvedValue({ all: [] })

      await expect(changelogCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(0)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')
      mockGit.log.mockResolvedValue({
        all: [{ hash: 'abc123', message: 'feat: test', author_name: 'Test', date: '2024-01-01' }]
      })

      await changelogCommand.parseAsync(['-p', 'anthropic'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('anthropic')
    })
  })
})
