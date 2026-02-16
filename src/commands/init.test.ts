import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

// Mock child_process for openFolder
vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}))

// Mock fs
const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args)
}))

// Mock AI SDK for translation
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: vi.fn(async () => ({
      text: 'Translated content'
    }))
  }
})

// Mock provider SDKs
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn())
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn())
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn())
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  resolveProvider: vi.fn(() => Promise.resolve('gemini')),
  getApiKey: vi.fn(() => 'test-api-key')
}))

// Mock config
vi.mock('../lib/config.js', () => ({
  getLanguage: vi.fn(() => 'en'),
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash')
}))

// Mock simple-git
const mockGit = {
  checkIsRepo: vi.fn(() => Promise.resolve(true)),
  revparse: vi.fn(() => Promise.resolve('/test/repo'))
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { initCommand } from './init.js'

describe('initCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGit.checkIsRepo.mockResolvedValue(true)
    // Default: template files exist in source, target doesn't exist
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes('.gut/commit.md') || path.includes('.gut/branch.md')) {
        return true
      }
      return false
    })
    mockReadFileSync.mockReturnValue('Template content with {{variable}}')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('project initialization', () => {
    it('should create .gut directory and copy templates', async () => {
      // Source templates exist, target doesn't exist
      mockExistsSync.mockImplementation((path: string) => {
        // Source template files exist
        if (path.includes('src/.gut/') || path.includes('dist/.gut/')) {
          return true
        }
        // Target doesn't exist
        return false
      })

      await initCommand.parseAsync([], { from: 'user' })

      expect(mockMkdirSync).toHaveBeenCalled()
    })

    it('should skip existing templates without --force', async () => {
      mockExistsSync.mockReturnValue(true)
      const consoleSpy = vi.spyOn(console, 'log')

      await initCommand.parseAsync([], { from: 'user' })

      // Should log skipped messages
      const skippedCalls = consoleSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('Skipped')
      )
      expect(skippedCalls.length).toBeGreaterThan(0)
    })

    it('should overwrite with --force flag', async () => {
      mockExistsSync.mockReturnValue(true)

      await initCommand.parseAsync(['--force'], { from: 'user' })

      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })

  describe('global initialization', () => {
    it('should initialize in ~/.config/gut/templates with --global', async () => {
      await initCommand.parseAsync(['--global'], { from: 'user' })

      expect(mockMkdirSync).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {

    it('should succeed with --global even outside git repo', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await initCommand.parseAsync(['--global'], { from: 'user' })

      expect(mockMkdirSync).toHaveBeenCalled()
    })
  })

  describe('translation', () => {
    it('should use pre-translated templates when available', async () => {
      const { getLanguage } = await import('../lib/config.js')
      vi.mocked(getLanguage).mockReturnValue('ja')

      // Simulate pre-translated templates exist
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('.gut/ja')) return true
        if (path.includes('.gut/commit.md')) return true
        return false
      })

      await initCommand.parseAsync([], { from: 'user' })

      // Should use pre-translated without calling AI
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('should skip translation with --no-translate', async () => {
      const { getLanguage } = await import('../lib/config.js')
      vi.mocked(getLanguage).mockReturnValue('ja')

      await initCommand.parseAsync(['--no-translate'], { from: 'user' })

      // Should still write files (original English)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })

  describe('open folder', () => {
    it('should open folder with --open flag', async () => {
      const { execSync } = await import('node:child_process')

      await initCommand.parseAsync(['--open'], { from: 'user' })

      expect(execSync).toHaveBeenCalled()
    })
  })
})
