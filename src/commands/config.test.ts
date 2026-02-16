import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called')
})

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// Mock child_process for openFolder
vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}))

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn()
}))

// Mock config module
const mockGetConfig = vi.fn()
const mockGetLocalConfig = vi.fn()
const mockSetLanguage = vi.fn()
const mockSetModel = vi.fn()
const mockSetProvider = vi.fn()
const mockIsValidLanguage = vi.fn()
const mockIsValidProvider = vi.fn()

vi.mock('../lib/config.js', () => ({
  getConfig: () => mockGetConfig(),
  getLocalConfig: () => mockGetLocalConfig(),
  setLanguage: (...args: unknown[]) => mockSetLanguage(...args),
  setModel: (...args: unknown[]) => mockSetModel(...args),
  setProvider: (...args: unknown[]) => mockSetProvider(...args),
  isValidLanguage: (v: string) => mockIsValidLanguage(v),
  isValidProvider: (v: string) => mockIsValidProvider(v),
  VALID_LANGUAGES: ['en', 'ja', 'zh', 'ko', 'es', 'fr', 'de'],
  VALID_PROVIDERS: ['gemini', 'openai', 'anthropic', 'ollama'],
  DEFAULT_MODELS: { gemini: 'gemini-2.5-flash', openai: 'gpt-4o', anthropic: 'claude-3-sonnet' }
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
import { configCommand } from './config.js'

describe('configCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockReturnValue({ lang: 'en', model: 'gemini-2.5-flash', provider: 'gemini' })
    mockGetLocalConfig.mockReturnValue({})
    mockIsValidLanguage.mockReturnValue(true)
    mockIsValidProvider.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('set subcommand', () => {
    describe('lang key', () => {
      it('should set language globally', async () => {
        await configCommand.parseAsync(['set', 'lang', 'ja'], { from: 'user' })

        expect(mockSetLanguage).toHaveBeenCalledWith('ja', false)
      })

      it('should set language locally with --local flag', async () => {
        await configCommand.parseAsync(['set', 'lang', 'ja', '--local'], { from: 'user' })

        expect(mockSetLanguage).toHaveBeenCalledWith('ja', true)
      })

      it('should reject invalid language', async () => {
        mockIsValidLanguage.mockReturnValue(false)

        await expect(
          configCommand.parseAsync(['set', 'lang', 'invalid'], { from: 'user' })
        ).rejects.toThrow('process.exit called')

        expect(mockExit).toHaveBeenCalledWith(1)
      })
    })

    describe('model key', () => {
      it('should set model locally with --local flag', async () => {
        await configCommand.parseAsync(['set', 'model', 'gpt-4o', '--local'], { from: 'user' })

        expect(mockSetModel).toHaveBeenCalledWith('gpt-4o', true)
      })
    })

    describe('provider key', () => {
      it('should reject invalid provider', async () => {
        mockIsValidProvider.mockReturnValue(false)

        await expect(
          configCommand.parseAsync(['set', 'provider', 'invalid'], { from: 'user' })
        ).rejects.toThrow('process.exit called')

        expect(mockExit).toHaveBeenCalledWith(1)
      })
    })

    describe('unknown key', () => {
      it('should reject unknown config key', async () => {
        await expect(
          configCommand.parseAsync(['set', 'unknown', 'value'], { from: 'user' })
        ).rejects.toThrow('process.exit called')

        expect(mockExit).toHaveBeenCalledWith(1)
      })
    })
  })

  describe('get subcommand', () => {
    it('should get config value', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await configCommand.parseAsync(['get', 'lang'], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('en')
    })

    it('should reject unknown key', async () => {
      mockGetConfig.mockReturnValue({})

      await expect(configCommand.parseAsync(['get', 'unknown'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('list subcommand', () => {
    it('should list all config values', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await configCommand.parseAsync(['list'], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should indicate local config values', async () => {
      mockGetLocalConfig.mockReturnValue({ lang: 'ja' })
      const consoleSpy = vi.spyOn(console, 'log')

      await configCommand.parseAsync(['list'], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('open subcommand', () => {
    it('should open global config folder by default', async () => {
      const { execSync } = await import('node:child_process')

      await configCommand.parseAsync(['open'], { from: 'user' })

      expect(execSync).toHaveBeenCalled()
    })

    it('should open templates folder with --templates flag', async () => {
      const { execSync } = await import('node:child_process')

      await configCommand.parseAsync(['open', '--templates'], { from: 'user' })

      expect(execSync).toHaveBeenCalled()
    })

    it('should open local folder with --local flag', async () => {
      const { execSync } = await import('node:child_process')

      await configCommand.parseAsync(['open', '--local'], { from: 'user' })

      expect(execSync).toHaveBeenCalled()
    })

    it('should fail when --local used outside git repo', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false)

      await expect(configCommand.parseAsync(['open', '--local'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      )

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })
})
