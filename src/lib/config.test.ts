import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the config module's internal functions
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    homedir: vi.fn(() => join(tmpdir(), 'gut-test-home'))
  }
})

vi.mock('child_process', () => ({
  execSync: vi.fn(() => join(tmpdir(), 'gut-test-repo'))
}))

import {
  getConfig,
  getDefaultModel,
  getGlobalConfig,
  isValidLanguage,
  isValidProvider,
  setGlobalConfig
} from './config.js'

describe('config', () => {
  const testHome = join(tmpdir(), 'gut-test-home')
  const testRepo = join(tmpdir(), 'gut-test-repo')
  const globalConfigDir = join(testHome, '.config', 'gut')
  const localConfigDir = join(testRepo, '.gut')

  beforeEach(() => {
    // Create test directories
    mkdirSync(globalConfigDir, { recursive: true })
    mkdirSync(localConfigDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directories
    try {
      rmSync(testHome, { recursive: true, force: true })
      rmSync(testRepo, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('getDefaultModel', () => {
    it('should fallback to gemini for unknown provider', () => {
      expect(getDefaultModel('unknown')).toBe(getDefaultModel('gemini'))
    })
  })

  describe('isValidLanguage', () => {
    it('should return true for valid languages', () => {
      expect(isValidLanguage('en')).toBe(true)
      expect(isValidLanguage('ja')).toBe(true)
    })

    it('should return false for invalid languages', () => {
      expect(isValidLanguage('fr')).toBe(false)
      expect(isValidLanguage('')).toBe(false)
      expect(isValidLanguage('english')).toBe(false)
    })
  })

  describe('isValidProvider', () => {
    it('should return true for valid providers', () => {
      expect(isValidProvider('gemini')).toBe(true)
      expect(isValidProvider('openai')).toBe(true)
      expect(isValidProvider('anthropic')).toBe(true)
      expect(isValidProvider('ollama')).toBe(true)
    })

    it('should return false for invalid providers', () => {
      expect(isValidProvider('azure')).toBe(false)
      expect(isValidProvider('')).toBe(false)
      expect(isValidProvider('gpt')).toBe(false)
    })
  })

  describe('getGlobalConfig', () => {
    it('should return default config when no config file exists', () => {
      const config = getGlobalConfig()
      expect(config.lang).toBe('en')
    })

    it('should read config from file', () => {
      const configPath = join(globalConfigDir, 'config.json')
      writeFileSync(configPath, JSON.stringify({ lang: 'ja' }))

      const config = getGlobalConfig()
      expect(config.lang).toBe('ja')
    })
  })

  describe('setGlobalConfig', () => {
    it('should write config to file', () => {
      setGlobalConfig('lang', 'ja')

      const configPath = join(globalConfigDir, 'config.json')
      const content = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(content.lang).toBe('ja')
    })
  })

  describe('getConfig', () => {
    it('should merge global and local config with local taking priority', () => {
      const globalPath = join(globalConfigDir, 'config.json')
      const localPath = join(localConfigDir, 'config.json')

      writeFileSync(globalPath, JSON.stringify({ lang: 'en', model: 'gpt-4' }))
      writeFileSync(localPath, JSON.stringify({ lang: 'ja' }))

      const config = getConfig()
      expect(config.lang).toBe('ja') // Local overrides global
      expect(config.model).toBe('gpt-4') // Global value preserved
    })
  })
})
