import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Language = 'en' | 'ja'
export type Provider = 'gemini' | 'openai' | 'anthropic' | 'ollama'

export interface GutConfig {
  lang: Language
  model?: string
  provider?: Provider
  baseUrl?: string
}

const DEFAULT_CONFIG: GutConfig = {
  lang: 'en'
}

export const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-5',
  ollama: 'llama3.3'
}

function getGlobalConfigPath(): string {
  const configDir = join(homedir(), '.config', 'gut')
  return join(configDir, 'config.json')
}

function getRepoRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
  } catch {
    return null
  }
}

function getLocalConfigPath(): string | null {
  const repoRoot = getRepoRoot()
  if (!repoRoot) return null
  return join(repoRoot, '.gut', 'config.json')
}

function ensureGlobalConfigDir(): void {
  const configDir = join(homedir(), '.config', 'gut')
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
}

function ensureLocalConfigDir(): void {
  const repoRoot = getRepoRoot()
  if (!repoRoot) return
  const gutDir = join(repoRoot, '.gut')
  if (!existsSync(gutDir)) {
    mkdirSync(gutDir, { recursive: true })
  }
}

function readConfigFile(path: string): Partial<GutConfig> {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

export function getGlobalConfig(): GutConfig {
  const globalPath = getGlobalConfigPath()
  return { ...DEFAULT_CONFIG, ...readConfigFile(globalPath) }
}

export function getLocalConfig(): Partial<GutConfig> {
  const localPath = getLocalConfigPath()
  if (!localPath) return {}
  return readConfigFile(localPath)
}

export function getConfig(): GutConfig {
  // Local config overrides global config
  const globalConfig = getGlobalConfig()
  const localConfig = getLocalConfig()
  return { ...globalConfig, ...localConfig }
}

export function setGlobalConfig<K extends keyof GutConfig>(key: K, value: GutConfig[K]): void {
  ensureGlobalConfigDir()
  const config = getGlobalConfig()
  config[key] = value
  writeFileSync(getGlobalConfigPath(), JSON.stringify(config, null, 2))
}

export function setLocalConfig<K extends keyof GutConfig>(key: K, value: GutConfig[K]): void {
  const localPath = getLocalConfigPath()
  if (!localPath) {
    throw new Error('Not in a git repository')
  }
  ensureLocalConfigDir()
  const config = getLocalConfig()
  config[key] = value
  writeFileSync(localPath, JSON.stringify(config, null, 2))
}

export function getLanguage(): Language {
  return getConfig().lang
}

export function setLanguage(lang: Language, local: boolean = false): void {
  if (local) {
    setLocalConfig('lang', lang)
  } else {
    setGlobalConfig('lang', lang)
  }
}

export function getLanguageInstruction(lang: Language): string {
  switch (lang) {
    case 'ja':
      return '\n\nIMPORTANT: Respond in Japanese (日本語で回答してください).'
    default:
      return ''
  }
}

export const VALID_LANGUAGES: Language[] = ['en', 'ja']

export function isValidLanguage(lang: string): lang is Language {
  return VALID_LANGUAGES.includes(lang as Language)
}

export function getConfiguredModel(): string | undefined {
  return getConfig().model
}

export function setModel(model: string, local: boolean = false): void {
  if (local) {
    setLocalConfig('model', model)
  } else {
    setGlobalConfig('model', model)
  }
}

export function getDefaultModel(provider: string): string {
  return DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini
}

export const VALID_PROVIDERS: Provider[] = ['gemini', 'openai', 'anthropic', 'ollama']

export function isValidProvider(provider: string): provider is Provider {
  return VALID_PROVIDERS.includes(provider as Provider)
}

export function getConfiguredProvider(): Provider | undefined {
  return getConfig().provider
}

export function setProvider(provider: Provider, local: boolean = false): void {
  if (local) {
    setLocalConfig('provider', provider)
  } else {
    setGlobalConfig('provider', provider)
  }
}

export function getBaseUrl(): string | undefined {
  return getConfig().baseUrl
}

export function setBaseUrl(url: string, local: boolean = false): void {
  if (url === '') {
    // Clear the setting
    const path = local ? getLocalConfigPath() : getGlobalConfigPath()
    if (local && !path) throw new Error('Not in a git repository')
    const config = local ? getLocalConfig() : getGlobalConfig()
    delete config.baseUrl
    writeFileSync(path || getGlobalConfigPath(), JSON.stringify(config, null, 2))
    return
  }

  // URL validation
  try {
    new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }

  if (local) {
    setLocalConfig('baseUrl', url)
  } else {
    setGlobalConfig('baseUrl', url)
  }
}
