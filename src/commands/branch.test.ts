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

// Mock readline for prompts
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_, cb) => cb('n')),
    close: vi.fn()
  }))
}))

// Create mock model
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: 'feature/add-user-auth'
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

// Mock gh CLI
vi.mock('../lib/gh.js', () => ({
  requireGhCli: vi.fn(() => true)
}))

// Mock child_process for gh issue view
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => JSON.stringify({ title: 'Test Issue', body: 'Issue description' }))
}))

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  checkoutLocalBranch: vi.fn(() => Promise.resolve())
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { branchCommand } from './branch.js'

describe('branchCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('branch name generation', () => {
    it('should generate branch name from description', async () => {
      await branchCommand.parseAsync(['-d', 'Add user authentication'], { from: 'user' })

      // Should not exit with error
      expect(mockExit).not.toHaveBeenCalled()
    })

    it('should generate branch name from issue number', async () => {
      await branchCommand.parseAsync(['123'], { from: 'user' })

      // Should fetch issue and generate branch name
      expect(mockExit).not.toHaveBeenCalled()
    })
  })

  describe('branch creation with --checkout', () => {
    it('should create and checkout branch when --checkout flag is used', async () => {
      await branchCommand.parseAsync(['-d', 'Add feature', '-c'], { from: 'user' })

      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('feature/add-user-auth')
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(branchCommand.parseAsync(['-d', 'test'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await branchCommand.parseAsync(['-d', 'test', '-p', 'openai', '-c'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('openai')
    })
  })
})
