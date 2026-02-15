const SERVICE_NAME = 'gut-cli'

export type Provider = 'gemini' | 'openai' | 'anthropic' | 'ollama'

// Providers that require API keys
type ApiKeyProvider = Exclude<Provider, 'ollama'>

const PROVIDER_KEY_MAP: Record<ApiKeyProvider, string> = {
  gemini: 'gemini-api-key',
  openai: 'openai-api-key',
  anthropic: 'anthropic-api-key'
}

const ENV_VAR_MAP: Record<ApiKeyProvider, string> = {
  gemini: 'GUT_GEMINI_API_KEY',
  openai: 'GUT_OPENAI_API_KEY',
  anthropic: 'GUT_ANTHROPIC_API_KEY'
}

const FALLBACK_ENV_MAP: Record<ApiKeyProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY'
}

async function getKeytar(): Promise<typeof import('keytar') | null> {
  try {
    const keytar = await import('keytar')
    // keytar is a CommonJS module, so we need to handle default export
    return keytar.default || keytar
  } catch {
    return null
  }
}

export async function saveApiKey(provider: Provider, apiKey: string): Promise<void> {
  if (provider === 'ollama') {
    throw new Error('Ollama does not require an API key')
  }
  const keytar = await getKeytar()
  if (!keytar) {
    throw new Error('Keychain not available. Set environment variable instead.')
  }
  await keytar.setPassword(SERVICE_NAME, PROVIDER_KEY_MAP[provider], apiKey)
}

export async function getApiKey(provider: Provider): Promise<string | null> {
  // Ollama doesn't need an API key
  if (provider === 'ollama') {
    return null
  }

  // 1. Check environment variable (GUT_*_API_KEY)
  const envKey = process.env[ENV_VAR_MAP[provider]]
  if (envKey) return envKey

  // 2. Check fallback environment variable (*_API_KEY)
  const fallbackKey = process.env[FALLBACK_ENV_MAP[provider]]
  if (fallbackKey) return fallbackKey

  // 3. Check system keychain
  const keytar = await getKeytar()
  if (!keytar) return null
  return keytar.getPassword(SERVICE_NAME, PROVIDER_KEY_MAP[provider])
}

export async function deleteApiKey(provider: Provider): Promise<boolean> {
  if (provider === 'ollama') {
    throw new Error('Ollama does not use an API key')
  }
  const keytar = await getKeytar()
  if (!keytar) {
    throw new Error('Keychain not available.')
  }
  return keytar.deletePassword(SERVICE_NAME, PROVIDER_KEY_MAP[provider])
}

export async function listProviders(): Promise<{ provider: Provider; hasKey: boolean }[]> {
  const apiKeyProviders: ApiKeyProvider[] = ['gemini', 'openai', 'anthropic']
  const results = await Promise.all(
    apiKeyProviders.map(async (provider) => ({
      provider: provider as Provider,
      hasKey: !!(await getApiKey(provider))
    }))
  )
  // Add ollama (always available, no key needed)
  results.push({ provider: 'ollama', hasKey: true })
  return results
}

export function getProviderDisplayName(provider: Provider): string {
  const names: Record<Provider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude',
    ollama: 'Ollama (Local)'
  }
  return names[provider]
}
