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
      // Prompt for API key
      const readline = await import('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      apiKey = await new Promise<string>((resolve) => {
        // Hide input for security
        process.stdout.write(chalk.cyan(`Enter ${getProviderDisplayName(provider)} API key: `))

        // Simple approach - just read the line
        rl.question('', (answer) => {
          resolve(answer)
        })
      })
      rl.close()
    }

    if (!apiKey || apiKey.trim() === '') {
      console.error(chalk.red('API key cannot be empty'))
      process.exit(1)
    }

    try {
      await saveApiKey(provider, apiKey.trim())
      console.log(chalk.green(`\n✓ API key for ${getProviderDisplayName(provider)} saved to system keychain`))
    } catch (error) {
      console.error(chalk.red('Failed to save API key'))
      console.error(chalk.gray(error instanceof Error ? error.message : 'Unknown error'))
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
    } catch (error) {
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
    } catch (error) {
      console.error(chalk.red('Failed to check status'))
      process.exit(1)
    }
  })
