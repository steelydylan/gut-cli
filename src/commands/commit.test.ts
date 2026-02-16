import { MockLanguageModelV1 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock process.exit to prevent test from exiting
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

// Create mock model
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: 'feat(test): add new feature'
  })
})

// Mock AI SDK
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: vi.fn(async () => ({
      text: 'feat(test): add new feature'
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
  add: vi.fn(() => Promise.resolve()),
  diff: vi.fn(() => Promise.resolve('diff content')),
  status: vi.fn(() =>
    Promise.resolve({
      staged: ['file.ts'],
      modified: [] as string[],
      not_added: [] as string[],
      created: [] as string[]
    })
  ),
  commit: vi.fn(() => Promise.resolve())
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks are set up
import { commitCommand } from './commit.js'

describe('commitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.diff.mockResolvedValue('diff --git a/file.ts\n+new content')
    mockGit.status.mockResolvedValue({
      staged: ['file.ts'],
      modified: [],
      not_added: [],
      created: []
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('with --commit flag', () => {
    it('should generate and commit message automatically', async () => {
      await commitCommand.parseAsync(['--commit'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalledWith(['--cached'])
      expect(mockGit.commit).toHaveBeenCalledWith('feat(test): add new feature')
    })

    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await commitCommand.parseAsync(['--commit', '-p', 'openai'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('openai')
    })
  })

  describe('with --all flag', () => {
    it('should stage all changes before generating', async () => {
      await commitCommand.parseAsync(['--commit', '--all'], { from: 'user' })

      expect(mockGit.add).toHaveBeenCalledWith('-A')
    })
  })

  describe('auto-staging behavior', () => {
    it('should auto-stage when nothing is staged', async () => {
      mockGit.diff
        .mockResolvedValueOnce('') // First call: --cached returns empty
        .mockResolvedValueOnce('unstaged diff') // Second call: unstaged diff
        .mockResolvedValueOnce('staged diff after auto-stage') // Third call: after staging

      mockGit.status.mockResolvedValue({
        staged: [] as string[],
        modified: ['file.ts'],
        not_added: [] as string[],
        created: [] as string[]
      })

      await commitCommand.parseAsync(['--commit'], { from: 'user' })

      // Should call add('-A') to auto-stage
      expect(mockGit.add).toHaveBeenCalledWith('-A')
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(commitCommand.parseAsync(['--commit'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should exit when no changes to commit', async () => {
      mockGit.diff.mockResolvedValue('')
      mockGit.status.mockResolvedValue({
        staged: [],
        modified: [],
        not_added: [],
        created: []
      })

      await expect(commitCommand.parseAsync(['--commit'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })
})
