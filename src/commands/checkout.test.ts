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
    succeed: vi.fn().mockReturnThis(),
    text: ''
  }))
}))

// Mock readline for confirmation prompts
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_prompt: string, callback: (answer: string) => void) => callback('y')),
    close: vi.fn()
  }))
}))

// Create mock model
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: 'feature/add-new-feature'
  })
})

// Mock AI SDK
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: vi.fn(async () => ({
      text: 'feature/add-new-feature'
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

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  diff: vi.fn(() => Promise.resolve('diff content')),
  status: vi.fn(() =>
    Promise.resolve({
      staged: [],
      modified: ['file.ts'],
      not_added: [],
      created: []
    })
  ),
  checkoutLocalBranch: vi.fn(() => Promise.resolve())
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { checkoutCommand } from './checkout.js'

describe('checkoutCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.diff.mockResolvedValue('diff --git a/file.ts\n+new content')
    mockGit.status.mockResolvedValue({
      staged: [],
      modified: ['file.ts'],
      not_added: [],
      created: []
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('branch name generation from diff', () => {
    it('should generate branch name and checkout with --yes flag', async () => {
      await checkoutCommand.parseAsync(['--yes'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalled()
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('feature/add-new-feature')
    })

    it('should use staged changes only with --staged flag', async () => {
      mockGit.diff.mockResolvedValue('staged diff content')

      await checkoutCommand.parseAsync(['--yes', '--staged'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalledWith(['--cached'])
    })
  })

  describe('untracked files handling', () => {
    it('should handle untracked files when no diff exists', async () => {
      mockGit.diff.mockResolvedValue('')
      mockGit.status.mockResolvedValue({
        staged: [],
        modified: [],
        not_added: ['new-file.ts'],
        created: []
      })

      await checkoutCommand.parseAsync(['--yes'], { from: 'user' })

      expect(mockGit.checkoutLocalBranch).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(checkoutCommand.parseAsync(['--yes'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should exit when no changes found', async () => {
      mockGit.diff.mockResolvedValue('')
      mockGit.status.mockResolvedValue({
        staged: [],
        modified: [],
        not_added: [],
        created: []
      })

      await expect(checkoutCommand.parseAsync(['--yes'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await checkoutCommand.parseAsync(['--yes', '-p', 'openai'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('openai')
    })
  })
})
