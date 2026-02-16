import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config module
vi.mock('./config.js', () => ({
  getConfiguredProvider: vi.fn(() => undefined)
}))

// Mock keytar
vi.mock('module', () => ({
  createRequire: vi.fn(() => () => null)
}))

import { getConfiguredProvider } from './config.js'
import {
  getProviderDisplayName,
  getFirstAvailableProvider,
  resolveProvider
} from './credentials.js'

describe('credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear environment variables
    delete process.env.GUT_GEMINI_API_KEY
    delete process.env.GUT_OPENAI_API_KEY
    delete process.env.GUT_ANTHROPIC_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  describe('getProviderDisplayName', () => {
    it('should return correct display names', () => {
      expect(getProviderDisplayName('gemini')).toBe('Google Gemini')
      expect(getProviderDisplayName('openai')).toBe('OpenAI')
      expect(getProviderDisplayName('anthropic')).toBe('Anthropic Claude')
      expect(getProviderDisplayName('ollama')).toBe('Ollama (Local)')
    })
  })

  describe('getFirstAvailableProvider', () => {
    it('should return ollama when no API keys are set', async () => {
      const provider = await getFirstAvailableProvider()
      expect(provider).toBe('ollama')
    })

    it('should return gemini when GEMINI_API_KEY is set', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      const provider = await getFirstAvailableProvider()
      expect(provider).toBe('gemini')
    })

    it('should return openai when only OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key'
      const provider = await getFirstAvailableProvider()
      expect(provider).toBe('openai')
    })

    it('should return anthropic when only ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key'
      const provider = await getFirstAvailableProvider()
      expect(provider).toBe('anthropic')
    })

    it('should prefer gemini over openai when both are set', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'test-key'
      const provider = await getFirstAvailableProvider()
      expect(provider).toBe('gemini')
    })

    it('should use GUT_ prefixed env vars', async () => {
      process.env.GUT_OPENAI_API_KEY = 'test-key'
      const provider = await getFirstAvailableProvider()
      expect(provider).toBe('openai')
    })
  })

  describe('resolveProvider', () => {
    it('should return CLI provider when explicitly provided', async () => {
      const provider = await resolveProvider('anthropic')
      expect(provider).toBe('anthropic')
    })

    it('should return config provider when no CLI provider', async () => {
      vi.mocked(getConfiguredProvider).mockReturnValue('openai')
      process.env.OPENAI_API_KEY = 'test-key'

      const provider = await resolveProvider(undefined)
      expect(provider).toBe('openai')
    })

    it('should fallback to first available when config provider has no API key', async () => {
      vi.mocked(getConfiguredProvider).mockReturnValue('anthropic')
      // anthropic has no key, but gemini does
      process.env.GEMINI_API_KEY = 'test-key'

      const provider = await resolveProvider(undefined)
      expect(provider).toBe('gemini')
    })

    it('should return ollama when no API keys are set', async () => {
      vi.mocked(getConfiguredProvider).mockReturnValue(undefined)

      const provider = await resolveProvider(undefined)
      expect(provider).toBe('ollama')
    })

    it('should return config provider ollama without API key check', async () => {
      vi.mocked(getConfiguredProvider).mockReturnValue('ollama')

      const provider = await resolveProvider(undefined)
      expect(provider).toBe('ollama')
    })

    it('should handle uppercase CLI provider', async () => {
      const provider = await resolveProvider('GEMINI')
      expect(provider).toBe('gemini')
    })
  })
})
