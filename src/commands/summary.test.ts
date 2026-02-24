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

// Mock child_process for clipboard
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
      title: 'Daily Work Summary',
      overview: 'Implemented new features and fixed bugs',
      highlights: ['Added authentication', 'Fixed API bug'],
      details: [
        { category: 'Features', items: ['User login', 'OAuth support'] },
        { category: 'Bug Fixes', items: ['API timeout fix'] }
      ],
      stats: { commits: 5 }
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

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  listConfig: vi.fn(() =>
    Promise.resolve({
      all: { 'user.name': 'Test User' }
    })
  ),
  log: vi.fn(() =>
    Promise.resolve({
      all: [
        { hash: 'abc123', message: 'feat: add feature', date: '2024-01-15' },
        { hash: 'def456', message: 'fix: bug fix', date: '2024-01-15' }
      ]
    })
  ),
  diff: vi.fn(() => Promise.resolve('diff content'))
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { summaryCommand } from './summary.js'

describe('summaryCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.listConfig.mockResolvedValue({
      all: { 'user.name': 'Test User' }
    })
    mockGit.log.mockResolvedValue({
      all: [{ hash: 'abc123', message: 'feat: add feature', date: '2024-01-15' }]
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('summary generation', () => {
    it('should generate work summary', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await summaryCommand.parseAsync([], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should use --daily flag for today', async () => {
      await summaryCommand.parseAsync(['--daily'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalled()
    })

    it('should use --weekly flag for past week', async () => {
      await summaryCommand.parseAsync(['--weekly'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalled()
    })

    it('should use custom --since date', async () => {
      await summaryCommand.parseAsync(['--since', '2024-01-01'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalled()
    })

    it('should use custom --author', async () => {
      await summaryCommand.parseAsync(['--author', 'John Doe'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalled()
    })
  })

  describe('output formats', () => {
    it('should output as JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await summaryCommand.parseAsync(['--json'], { from: 'user' })

      const jsonCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('{')
      )
      expect(jsonCall).toBeDefined()
    })

    it('should output as markdown with --markdown flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await summaryCommand.parseAsync(['--markdown'], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('diff analysis', () => {
    it('should include diff with --with-diff flag', async () => {
      await summaryCommand.parseAsync(['--with-diff'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(summaryCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await summaryCommand.parseAsync(['-p', 'anthropic'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('anthropic')
    })
  })
})
