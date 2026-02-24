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

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  searchCommits: vi.fn(() =>
    Promise.resolve({
      matches: [
        {
          hash: 'abc1234',
          message: 'feat: add login',
          author: 'test',
          email: 'test@test.com',
          date: '2024-01-01',
          reason: 'Matches login query',
          relevance: 'high'
        }
      ],
      summary: 'Found 1 matching commit'
    })
  ),
  findTemplate: vi.fn(() => null)
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
  log: vi.fn(() =>
    Promise.resolve({
      all: [
        {
          hash: 'abc123',
          message: 'feat: add login',
          author_name: 'Test',
          author_email: 'test@test.com',
          date: '2024-01-01'
        },
        {
          hash: 'def456',
          message: 'fix: auth bug',
          author_name: 'Test',
          author_email: 'test@test.com',
          date: '2024-01-02'
        }
      ]
    })
  )
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { findCommand } from './find.js'

describe('findCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.log.mockResolvedValue({
      all: [
        {
          hash: 'abc123',
          message: 'feat: add login',
          author_name: 'Test',
          author_email: 'test@test.com',
          date: '2024-01-01'
        }
      ]
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('commit search', () => {
    it('should search commits with given query', async () => {
      await findCommand.parseAsync(['login feature'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalled()
    })

    it('should limit number of commits searched with -n option', async () => {
      await findCommand.parseAsync(['search query', '-n', '50'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith(expect.arrayContaining(['-n', '50']))
    })

    it('should filter by author with --author option', async () => {
      await findCommand.parseAsync(['search query', '--author', 'john'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith(expect.arrayContaining(['--author=john']))
    })

    it('should filter by date with --since option', async () => {
      await findCommand.parseAsync(['search query', '--since', '2024-01-01'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith(expect.arrayContaining(['--since=2024-01-01']))
    })

    it('should filter by path with --path option', async () => {
      await findCommand.parseAsync(['search query', '--path', 'src/'], { from: 'user' })

      expect(mockGit.log).toHaveBeenCalledWith(expect.arrayContaining(['--', 'src/']))
    })
  })

  describe('output formats', () => {
    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await findCommand.parseAsync(['query', '--json'], { from: 'user' })

      const calls = consoleSpy.mock.calls
      const jsonCall = calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('matches')
      )
      expect(jsonCall).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(findCommand.parseAsync(['query'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should exit when no commits found', async () => {
      mockGit.log.mockResolvedValue({ all: [] })

      await expect(findCommand.parseAsync(['query'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await findCommand.parseAsync(['query', '-p', 'anthropic'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('anthropic')
    })
  })
})
