import keytar from 'keytar'

const SERVICE_NAME = 'gut-cli'

export type Provider = 'gemini' | 'openai' | 'anthropic'

const PROVIDER_KEY_MAP: Record<Provider, string> = {
  gemini: 'gemini-api-key',
  openai: 'openai-api-key',
  anthropic: 'anthropic-api-key'
}

const ENV_VAR_MAP: Record<Provider, string> = {
  gemini: 'GUT_GEMINI_API_KEY',
  openai: 'GUT_OPENAI_API_KEY',
  anthropic: 'GUT_ANTHROPIC_API_KEY'
}

const FALLBACK_ENV_MAP: Record<Provider, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY'
}

export async function saveApiKey(provider: Provider, apiKey: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, PROVIDER_KEY_MAP[provider], apiKey)
}

export async function getApiKey(provider: Provider): Promise<string | null> {
  // 1. Check environment variable (GUT_*_API_KEY)
  const envKey = process.env[ENV_VAR_MAP[provider]]
  if (envKey) return envKey

  // 2. Check fallback environment variable (*_API_KEY)
  const fallbackKey = process.env[FALLBACK_ENV_MAP[provider]]
  if (fallbackKey) return fallbackKey

  // 3. Check system keychain
  return keytar.getPassword(SERVICE_NAME, PROVIDER_KEY_MAP[provider])
}

export async function deleteApiKey(provider: Provider): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, PROVIDER_KEY_MAP[provider])
}

export async function listProviders(): Promise<{ provider: Provider; hasKey: boolean }[]> {
  const providers: Provider[] = ['gemini', 'openai', 'anthropic']
  const results = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      hasKey: !!(await getApiKey(provider))
    }))
  )
  return results
}

export function getProviderDisplayName(provider: Provider): string {
  const names: Record<Provider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude'
  }
  return names[provider]
}
