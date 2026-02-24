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

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch'),
  writeFileSync: vi.fn()
}))

// Mock readline for prompts
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_, cb) => cb('y')),
    close: vi.fn()
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
      resolvedContent: 'merged content',
      explanation: 'Combined both changes',
      strategy: 'combined'
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
  getLanguage: vi.fn(() => 'en')
}))

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  status: vi.fn(() =>
    Promise.resolve({
      modified: [] as string[],
      staged: [] as string[],
      conflicted: [] as string[]
    })
  ),
  branch: vi.fn(() => Promise.resolve({ current: 'main' })),
  merge: vi.fn(() => Promise.resolve()),
  add: vi.fn(() => Promise.resolve()),
  commit: vi.fn(() => Promise.resolve())
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { mergeCommand } from './merge.js'

describe('mergeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status.mockResolvedValue({
      modified: [],
      staged: [],
      conflicted: []
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('simple merge', () => {
    it('should merge branch without conflicts', async () => {
      await mergeCommand.parseAsync(['feature/test'], { from: 'user' })

      expect(mockGit.merge).toHaveBeenCalledWith(['feature/test'])
    })
  })

  describe('merge with conflicts', () => {
    it('should detect and attempt AI resolution for conflicts', async () => {
      // First merge fails, then status shows conflicts
      mockGit.merge.mockRejectedValueOnce(new Error('Merge conflict'))
      mockGit.status
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: [] }) // Initial check
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: ['file.ts'] }) // After failed merge
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: [] }) // Final check

      await mergeCommand.parseAsync(['feature/conflict'], { from: 'user' })

      expect(mockGit.merge).toHaveBeenCalledWith(['feature/conflict'])
    })
  })

  describe('uncommitted changes check', () => {
    it('should exit when there are uncommitted changes', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file.ts'],
        staged: [],
        conflicted: []
      })

      await expect(mergeCommand.parseAsync(['feature/test'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('--no-commit option', () => {
    it('should not auto-commit when --no-commit is used', async () => {
      mockGit.merge.mockRejectedValueOnce(new Error('conflict'))
      mockGit.status
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: [] })
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: ['file.ts'] })
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: [] })

      await mergeCommand.parseAsync(['feature/test', '--no-commit'], { from: 'user' })

      // commit should not be called due to --no-commit
      expect(mockGit.commit).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(mergeCommand.parseAsync(['feature/test'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider for conflict resolution', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      mockGit.merge.mockRejectedValueOnce(new Error('conflict'))
      mockGit.status
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: [] })
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: ['file.ts'] })
        .mockResolvedValueOnce({ modified: [], staged: [], conflicted: [] })

      await mergeCommand.parseAsync(['feature/test', '-p', 'anthropic'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('anthropic')
    })
  })
})
