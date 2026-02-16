import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called')
})

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// Mock config module
const mockGetLanguage = vi.fn()
const mockSetLanguage = vi.fn()
const mockGetLocalConfig = vi.fn()
const mockIsValidLanguage = vi.fn()

vi.mock('../lib/config.js', () => ({
  getLanguage: () => mockGetLanguage(),
  setLanguage: (...args: unknown[]) => mockSetLanguage(...args),
  getLocalConfig: () => mockGetLocalConfig(),
  isValidLanguage: (v: string) => mockIsValidLanguage(v),
  VALID_LANGUAGES: ['en', 'ja', 'zh', 'ko', 'es', 'fr', 'de']
}))

// Import the command after mocks
import { langCommand } from './lang.js'

describe('langCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLanguage.mockReturnValue('en')
    mockGetLocalConfig.mockReturnValue({})
    mockIsValidLanguage.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('show current language', () => {
    it('should show current language when no argument provided', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await langCommand.parseAsync([], { from: 'user' })

      expect(mockGetLanguage).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should indicate local config when set locally', async () => {
      mockGetLocalConfig.mockReturnValue({ lang: 'ja' })
      const consoleSpy = vi.spyOn(console, 'log')

      await langCommand.parseAsync([], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('set language', () => {
    it('should set language globally', async () => {
      await langCommand.parseAsync(['ja'], { from: 'user' })

      expect(mockSetLanguage).toHaveBeenCalledWith('ja', false)
    })

    it('should set language locally with --local flag', async () => {
      await langCommand.parseAsync(['ja', '--local'], { from: 'user' })

      expect(mockSetLanguage).toHaveBeenCalledWith('ja', true)
    })

    it('should reject invalid language', async () => {
      mockIsValidLanguage.mockReturnValue(false)

      await expect(
        langCommand.parseAsync(['invalid'], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should handle setLanguage error', async () => {
      mockSetLanguage.mockImplementation(() => {
        throw new Error('Write error')
      })

      await expect(
        langCommand.parseAsync(['ja'], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

})
