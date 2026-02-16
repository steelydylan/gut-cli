import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called')
})

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// Mock credentials module
const mockSaveApiKey = vi.fn()
const mockDeleteApiKey = vi.fn()
const mockListProviders = vi.fn()
const mockGetProviderDisplayName = vi.fn((p: string) => {
  const names: Record<string, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic'
  }
  return names[p] || p
})

vi.mock('../lib/credentials.js', () => ({
  saveApiKey: (...args: unknown[]) => mockSaveApiKey(...args),
  deleteApiKey: (...args: unknown[]) => mockDeleteApiKey(...args),
  listProviders: () => mockListProviders(),
  getProviderDisplayName: (p: string) => mockGetProviderDisplayName(p)
}))

// Import the command after mocks
import { authCommand } from './auth.js'

describe('authCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveApiKey.mockResolvedValue(undefined)
    mockDeleteApiKey.mockResolvedValue(true)
    mockListProviders.mockResolvedValue([
      { provider: 'gemini', hasKey: true },
      { provider: 'openai', hasKey: false },
      { provider: 'anthropic', hasKey: false }
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('login subcommand', () => {
    it('should save API key when provided via --key flag', async () => {
      await authCommand.parseAsync(['login', '-p', 'gemini', '-k', 'test-api-key'], { from: 'user' })

      expect(mockSaveApiKey).toHaveBeenCalledWith('gemini', 'test-api-key')
    })

    it('should reject invalid provider', async () => {
      await expect(
        authCommand.parseAsync(['login', '-p', 'invalid', '-k', 'key'], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should reject empty API key', async () => {
      await expect(
        authCommand.parseAsync(['login', '-p', 'gemini', '-k', '   '], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should handle save failure', async () => {
      mockSaveApiKey.mockRejectedValue(new Error('Keychain error'))

      await expect(
        authCommand.parseAsync(['login', '-p', 'gemini', '-k', 'test-key'], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('logout subcommand', () => {
    it('should delete API key for provider', async () => {
      await authCommand.parseAsync(['logout', '-p', 'gemini'], { from: 'user' })

      expect(mockDeleteApiKey).toHaveBeenCalledWith('gemini')
    })

    it('should handle no key found', async () => {
      mockDeleteApiKey.mockResolvedValue(false)

      await authCommand.parseAsync(['logout', '-p', 'openai'], { from: 'user' })

      expect(mockDeleteApiKey).toHaveBeenCalledWith('openai')
    })

    it('should reject invalid provider', async () => {
      await expect(
        authCommand.parseAsync(['logout', '-p', 'invalid'], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should handle delete failure', async () => {
      mockDeleteApiKey.mockRejectedValue(new Error('Keychain error'))

      await expect(
        authCommand.parseAsync(['logout', '-p', 'gemini'], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('status subcommand', () => {
    it('should list all providers with status', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await authCommand.parseAsync(['status'], { from: 'user' })

      expect(mockListProviders).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should handle status check failure', async () => {
      mockListProviders.mockRejectedValue(new Error('Check failed'))

      await expect(
        authCommand.parseAsync(['status'], { from: 'user' })
      ).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })
})
