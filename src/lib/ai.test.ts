import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Mock dependencies
vi.mock('ai', () => ({
  generateText: vi.fn(),
  generateObject: vi.fn()
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn())
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn())
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn())
}))

vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => vi.fn())
}))

vi.mock('./credentials.js', () => ({
  getApiKey: vi.fn(() => 'test-api-key'),
  Provider: {}
}))

vi.mock('./config.js', () => ({
  getConfiguredModel: vi.fn(() => undefined),
  getDefaultModel: vi.fn((provider: string) => {
    const models: Record<string, string> = {
      gemini: 'gemini-2.5-flash',
      openai: 'gpt-4.1-mini',
      anthropic: 'claude-sonnet-4-5',
      ollama: 'llama3.3'
    }
    return models[provider] || models['gemini']
  })
}))

import { findTemplate, findGlobalTemplate } from './ai.js'

describe('ai', () => {
  describe('findTemplate', () => {
    it('should return null when no template exists', () => {
      const result = findTemplate('/nonexistent/path', 'commit')
      expect(result).toBeNull()
    })

    it('should find project-level template', () => {
      // The actual .gut folder exists in the project
      const repoRoot = process.cwd()
      const result = findTemplate(repoRoot, 'commit')

      // Should find the commit.md template
      expect(result).not.toBeNull()
      expect(result).toContain('commit')
    })
  })

  describe('findGlobalTemplate', () => {
    it('should return null when no global template exists', () => {
      const result = findGlobalTemplate('nonexistent-template')
      expect(result).toBeNull()
    })
  })
})

describe('template content', () => {
  const templatesDir = join(process.cwd(), '.gut')
  const jaTemplatesDir = join(templatesDir, 'ja')

  const templateFiles = [
    'commit.md',
    'pr.md',
    'review.md',
    'branch.md',
    'changelog.md',
    'checkout.md',
    'explain.md',
    'explain-file.md',
    'find.md',
    'gitignore.md',
    'merge.md',
    'stash.md',
    'summary.md'
  ]

  describe('English templates', () => {
    templateFiles.forEach(file => {
      it(`should have ${file} template`, () => {
        const templatePath = join(templatesDir, file)
        expect(existsSync(templatePath)).toBe(true)

        const content = readFileSync(templatePath, 'utf-8')
        expect(content.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Japanese templates', () => {
    templateFiles.forEach(file => {
      it(`should have ${file} Japanese template`, () => {
        const templatePath = join(jaTemplatesDir, file)
        expect(existsSync(templatePath)).toBe(true)

        const content = readFileSync(templatePath, 'utf-8')
        expect(content.length).toBeGreaterThan(0)
      })
    })
  })

  describe('template consistency', () => {
    templateFiles.forEach(file => {
      it(`English and Japanese ${file} should have similar structure`, () => {
        const enPath = join(templatesDir, file)
        const jaPath = join(jaTemplatesDir, file)

        const enContent = readFileSync(enPath, 'utf-8')
        const jaContent = readFileSync(jaPath, 'utf-8')

        // Both should have content
        expect(enContent.length).toBeGreaterThan(0)
        expect(jaContent.length).toBeGreaterThan(0)

        // Both should have similar heading structure (## markers)
        const enHeadings = (enContent.match(/^## /gm) || []).length
        const jaHeadings = (jaContent.match(/^## /gm) || []).length
        expect(jaHeadings).toBe(enHeadings)
      })
    })
  })
})
