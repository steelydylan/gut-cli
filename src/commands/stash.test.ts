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
    question: vi.fn((_, cb) => cb('y')),
    close: vi.fn()
  }))
}))

// Mock AI module
vi.mock('../lib/ai.js', () => ({
  generateStashName: vi.fn(() => Promise.resolve('WIP: test changes')),
  findTemplate: vi.fn(() => null)
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(() => Promise.resolve('gemini')),
  getApiKey: vi.fn(() => 'test-api-key'),
  Provider: {},
  PROVIDERS: ['gemini', 'openai', 'anthropic', 'ollama']
}))

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo')),
  status: vi.fn(() =>
    Promise.resolve({
      isClean: (() => false) as () => boolean,
      modified: ['file.ts'] as string[],
      not_added: [] as string[]
    })
  ),
  stash: vi.fn(() => Promise.resolve()),
  stashList: vi.fn(() =>
    Promise.resolve({
      all: [{ message: 'WIP: test stash' }]
    })
  ),
  diff: vi.fn(() => Promise.resolve('diff content'))
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { stashCommand } from './stash.js'

describe('stashCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status.mockResolvedValue({
      isClean: (() => false) as () => boolean,
      modified: ['file.ts'] as string[],
      not_added: [] as string[]
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('stash creation', () => {
    it('should create stash with AI-generated name', async () => {
      await stashCommand.parseAsync([], { from: 'user' })

      expect(mockGit.stash).toHaveBeenCalledWith(['push', '-u', '-m', 'WIP: test changes'])
    })

    it('should create stash with custom name', async () => {
      await stashCommand.parseAsync(['my custom stash'], { from: 'user' })

      expect(mockGit.stash).toHaveBeenCalledWith(['push', '-u', '-m', 'my custom stash'])
    })

    it('should show message when no changes to stash', async () => {
      mockGit.status.mockResolvedValue({
        isClean: (() => true) as () => boolean,
        modified: [] as string[],
        not_added: [] as string[]
      })

      await stashCommand.parseAsync([], { from: 'user' })

      expect(mockGit.stash).not.toHaveBeenCalled()
    })
  })

  describe('stash list', () => {
    it('should list stashes with -l flag', async () => {
      await stashCommand.parseAsync(['-l'], { from: 'user' })

      expect(mockGit.stashList).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should exit when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(stashCommand.parseAsync([], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })
})
