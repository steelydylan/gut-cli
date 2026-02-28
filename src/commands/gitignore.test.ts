import { MockLanguageModelV1 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mocks for fs
const { mockExistsSync, mockWriteFileSync, mockReadFileSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn()
}))

// Mock process.exit
vi.spyOn(process, 'exit').mockImplementation(() => {
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
    succeed: vi.fn().mockReturnThis(),
    text: ''
  }))
}))

// Mock readline for confirmation prompts
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_prompt: string, callback: (answer: string) => void) => callback('y')),
    close: vi.fn()
  }))
}))

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args)
}))

// Create mock model
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 20 },
    text: 'node_modules/\n.env\ndist/'
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
  PROVIDERS: ['gemini', 'openai', 'anthropic', 'ollama']
}))

// Mock config
vi.mock('../lib/config.js', () => ({
  getConfiguredModel: vi.fn(() => undefined),
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash'),
  getLanguage: vi.fn(() => 'en'),
  getBaseUrl: vi.fn(() => undefined)
}))

// Mock simple-git
const mockGit = {
  revparse: vi.fn(() => Promise.resolve('/test/repo'))
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

// Import the command after mocks
import { gitignoreCommand } from './gitignore.js'

describe('gitignoreCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset Commander options to prevent state leakage between tests
    // @ts-expect-error - accessing internal Commander state
    gitignoreCommand._optionValues = { output: '.gitignore' }
    // Allow gut's default template to be found, but return false for .gitignore in repo
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('.gut/gitignore.md')) {
        return true
      }
      return false
    })
    mockReaddirSync.mockReturnValue([
      { name: 'src', isDirectory: () => true },
      { name: 'package.json', isDirectory: () => false }
    ])
    mockReadFileSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('.gut/gitignore.md')) {
        return 'Generate a .gitignore file for this project.'
      }
      return '{"name": "test"}'
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('gitignore generation', () => {
    it('should generate gitignore and write to file', async () => {
      await gitignoreCommand.parseAsync(['--yes'], { from: 'user' })

      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('should output to stdout with --stdout flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await gitignoreCommand.parseAsync(['--stdout'], { from: 'user' })

      expect(consoleSpy).toHaveBeenCalledWith('node_modules/\n.env\ndist/')
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it('should use custom output file with --output flag', async () => {
      await gitignoreCommand.parseAsync(['--yes', '-o', 'custom.gitignore'], { from: 'user' })

      expect(mockWriteFileSync).toHaveBeenCalled()
      const call = mockWriteFileSync.mock.calls[0]
      expect(call[0]).toContain('custom.gitignore')
    })
  })

  describe('existing gitignore handling', () => {
    it('should detect existing gitignore', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('.gut/gitignore.md')) {
          return true
        }
        return path.includes('.gitignore')
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('.gut/gitignore.md')) {
          return 'Generate a .gitignore file for this project.'
        }
        if (path.includes('.gitignore')) {
          return '# existing\nnode_modules/'
        }
        return '{"name": "test"}'
      })

      await gitignoreCommand.parseAsync(['--yes'], { from: 'user' })

      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })

  describe('project detection', () => {
    it('should detect config files for context', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('.gut/gitignore.md')) {
          return true
        }
        return path.includes('package.json') || path.includes('tsconfig.json')
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('.gut/gitignore.md')) {
          return 'Generate a .gitignore file for this project.'
        }
        return '{}'
      })

      await gitignoreCommand.parseAsync(['--stdout'], { from: 'user' })

      // Should have called to read config files
      expect(mockReadFileSync).toHaveBeenCalled()
    })
  })

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const { resolveProvider } = await import('../lib/credentials.js')

      await gitignoreCommand.parseAsync(['--stdout', '-p', 'openai'], { from: 'user' })

      expect(resolveProvider).toHaveBeenCalledWith('openai')
    })
  })
})
