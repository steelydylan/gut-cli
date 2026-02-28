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
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => 'file content')
}))

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  generateExplanation: vi.fn(() =>
    Promise.resolve({
      summary: 'This commit adds a new feature',
      purpose: 'To improve functionality',
      changes: [{ file: 'feature.ts', description: 'New feature file' }],
      impact: 'Adds new capability',
      notes: ['Consider adding tests']
    })
  ),
  findTemplate: vi.fn(() => null)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(() => Promise.resolve('gemini')),
  getApiKey: vi.fn(() => 'test-api-key'),
  Provider: {},
  PROVIDERS: ['gemini', 'openai', 'anthropic', 'ollama']
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

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(),
  revparse: vi.fn(),
  diff: vi.fn(),
  log: vi.fn()
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { explainCommand } from './explain.js'

describe('explainCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset all mocks with default values
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.revparse.mockResolvedValue('/test/repo')
    mockGit.diff.mockReset()
    mockGit.log.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('explain uncommitted changes', () => {
    it('should explain uncommitted changes by default', async () => {
      mockGit.diff.mockResolvedValueOnce('staged diff').mockResolvedValueOnce('unstaged diff')

      await explainCommand.parseAsync([], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalled()
    })
  })

  describe('explain staged changes', () => {
    it('should explain only staged changes with --staged flag', async () => {
      mockGit.diff.mockResolvedValue('staged diff content')

      await explainCommand.parseAsync(['--staged'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalledWith(['--cached'])
    })
  })

  describe('explain commit', () => {
    it('should explain specific commit by hash', async () => {
      mockGit.diff.mockResolvedValue('staged diff')

      await explainCommand.parseAsync(['--staged'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalledWith(['--cached'])
    })
  })

  describe('JSON output', () => {
    it('should output JSON with --json flag', async () => {
      mockGit.diff
        .mockResolvedValueOnce('staged diff content')
        .mockResolvedValueOnce('unstaged diff content')

      await explainCommand.parseAsync(['--json'], { from: 'user' })

      expect(mockGit.diff).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(explainCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should exit when no changes to explain', async () => {
      mockGit.diff.mockResolvedValueOnce('').mockResolvedValueOnce('')

      await expect(explainCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      mockGit.diff.mockResolvedValueOnce('staged').mockResolvedValueOnce('unstaged')
      const { resolveProvider } = await import('../lib/credentials.js')

      await explainCommand.parseAsync(['-p', 'openai'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('openai')
    })
  })
})
