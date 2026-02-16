import { Command } from 'commander'
import chalk from 'chalk'
import {
  saveApiKey,
  deleteApiKey,
  listProviders,
  getProviderDisplayName,
  Provider
} from '../lib/credentials.js'

const PROVIDERS: Provider[] = ['gemini', 'openai', 'anthropic']

async function readSecretInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(chalk.cyan(prompt))

    let input = ''
    const stdin = process.stdin

    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const onData = (data: string) => {
      // Handle each character in the data (paste operations send multiple chars)
      for (const char of data) {
        const charCode = char.charCodeAt(0)

        if (charCode === 13 || charCode === 10) {
          // Enter key
          stdin.setRawMode(false)
          stdin.pause()
          stdin.removeListener('data', onData)
          console.log() // New line after input
          resolve(input)
          return
        } else if (charCode === 127 || charCode === 8) {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1)
            process.stdout.write('\b \b')
          }
        } else if (charCode === 3) {
          // Ctrl+C
          stdin.setRawMode(false)
          stdin.pause()
          console.log()
          process.exit(0)
        } else if (charCode >= 32) {
          // Printable characters
          input += char
          process.stdout.write('*')
        }
      }
    }

    stdin.on('data', onData)
  })
}

export const authCommand = new Command('auth').description('Manage API key authentication')

authCommand
  .command('login')
  .description('Save an API key to the system keychain')
  .requiredOption('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)')
  .option('-k, --key <key>', 'API key (if not provided, will prompt)')
  .action(async (options) => {
    const provider = options.provider.toLowerCase() as Provider

    if (!PROVIDERS.includes(provider)) {
      console.error(chalk.red(`Invalid provider: ${options.provider}`))
      console.error(chalk.gray(`Valid providers: ${PROVIDERS.join(', ')}`))
      process.exit(1)
    }

    let apiKey = options.key

    if (!apiKey) {
      const providerName = getProviderDisplayName(provider)
      console.log(chalk.bold(`\n🔑 ${providerName} API Key Setup\n`))
      console.log(chalk.gray(`Your API key will be stored securely in the system keychain.`))
      console.log()

      apiKey = await readSecretInput(`Enter ${providerName} API key: `)
    }

    if (!apiKey || apiKey.trim() === '') {
      console.error(chalk.red('API key cannot be empty'))
      process.exit(1)
    }

    try {
      await saveApiKey(provider, apiKey.trim())
      console.log(chalk.green(`\n✓ API key for ${getProviderDisplayName(provider)} saved to system keychain`))
    } catch (err) {
      console.error(chalk.red('Failed to save API key'))
      console.error(chalk.gray(err instanceof Error ? err.message : 'Unknown error'))
      process.exit(1)
    }
  })

authCommand
  .command('logout')
  .description('Remove an API key from the system keychain')
  .requiredOption('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)')
  .action(async (options) => {
    const provider = options.provider.toLowerCase() as Provider

    if (!PROVIDERS.includes(provider)) {
      console.error(chalk.red(`Invalid provider: ${options.provider}`))
      process.exit(1)
    }

    try {
      const deleted = await deleteApiKey(provider)
      if (deleted) {
        console.log(chalk.green(`✓ API key for ${getProviderDisplayName(provider)} removed`))
      } else {
        console.log(chalk.yellow(`No API key found for ${getProviderDisplayName(provider)}`))
      }
    } catch {
      console.error(chalk.red('Failed to remove API key'))
      process.exit(1)
    }
  })

authCommand
  .command('status')
  .description('Show which providers have API keys configured')
  .action(async () => {
    try {
      const providers = await listProviders()

      console.log(chalk.bold('\nAPI Key Status:\n'))

      for (const { provider, hasKey } of providers) {
        const status = hasKey ? chalk.green('✓ configured') : chalk.gray('○ not set')
        console.log(`  ${getProviderDisplayName(provider).padEnd(20)} ${status}`)
      }

      console.log(
        chalk.gray('\nKeys can also be set via environment variables:')
      )
      console.log(chalk.gray('  GUT_GEMINI_API_KEY, GUT_OPENAI_API_KEY, GUT_ANTHROPIC_API_KEY\n'))
    } catch {
      console.error(chalk.red('Failed to check status'))
      process.exit(1)
    }
  })
