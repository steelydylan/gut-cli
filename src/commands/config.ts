import { Command } from 'commander'
import chalk from 'chalk'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { simpleGit } from 'simple-git'
import {
  getConfig,
  getLocalConfig,
  setLanguage,
  setModel,
  setProvider,
  isValidLanguage,
  isValidProvider,
  VALID_LANGUAGES,
  VALID_PROVIDERS,
  DEFAULT_MODELS,
  type GutConfig
} from '../lib/config.js'

function openFolder(path: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' :
              platform === 'win32' ? 'start ""' : 'xdg-open'
  execSync(`${cmd} "${path}"`)
}

export const configCommand = new Command('config')
  .description('Manage gut configuration')

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .option('--local', 'Set for current repository only')
  .action((key: string, value: string, options: { local?: boolean }) => {
    if (key === 'lang') {
      if (!isValidLanguage(value)) {
        console.error(chalk.red(`Invalid language: ${value}`))
        console.error(chalk.gray(`Valid languages: ${VALID_LANGUAGES.join(', ')}`))
        process.exit(1)
      }
      try {
        setLanguage(value, options.local ?? false)
        const scope = options.local ? '(local)' : '(global)'
        console.log(chalk.green(`✓ Language set to: ${value} ${scope}`))
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exit(1)
      }
    } else if (key === 'model') {
      try {
        setModel(value, options.local ?? false)
        const scope = options.local ? '(local)' : '(global)'
        console.log(chalk.green(`✓ Model set to: ${value} ${scope}`))
        console.log(chalk.gray(`Default models: ${Object.entries(DEFAULT_MODELS).map(([k, v]) => `${k}=${v}`).join(', ')}`))
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exit(1)
      }
    } else if (key === 'provider') {
      if (!isValidProvider(value)) {
        console.error(chalk.red(`Invalid provider: ${value}`))
        console.error(chalk.gray(`Valid providers: ${VALID_PROVIDERS.join(', ')}`))
        process.exit(1)
      }
      try {
        setProvider(value, options.local ?? false)
        const scope = options.local ? '(local)' : '(global)'
        console.log(chalk.green(`✓ Provider set to: ${value} ${scope}`))
      } catch (err) {
        console.error(chalk.red((err as Error).message))
        process.exit(1)
      }
    } else {
      console.error(chalk.red(`Unknown config key: ${key}`))
      console.error(chalk.gray('Available keys: lang, model, provider'))
      process.exit(1)
    }
  })

configCommand
  .command('get <key>')
  .description('Get a configuration value')
  .action((key: string) => {
    const config = getConfig()
    if (key in config) {
      console.log(config[key as keyof GutConfig])
    } else {
      console.error(chalk.red(`Unknown config key: ${key}`))
      process.exit(1)
    }
  })

configCommand
  .command('list')
  .description('List all configuration values')
  .action(() => {
    const localConfig = getLocalConfig()
    const effectiveConfig = getConfig()

    console.log(chalk.bold('Configuration:'))
    console.log()

    for (const key of Object.keys(effectiveConfig) as (keyof GutConfig)[]) {
      const value = effectiveConfig[key]
      const isLocal = key in localConfig
      const scope = isLocal ? chalk.cyan(' (local)') : chalk.gray(' (global)')
      console.log(`  ${chalk.cyan(key)}: ${value}${scope}`)
    }

    if (Object.keys(localConfig).length > 0) {
      console.log()
      console.log(chalk.gray('Local config: .gut/config.json'))
    }
  })

configCommand
  .command('open')
  .description('Open configuration or templates folder')
  .option('-t, --templates', 'Open templates folder instead of config')
  .option('-g, --global', 'Open global folder (default)')
  .option('-l, --local', 'Open local/project folder')
  .action(async (options: { templates?: boolean; global?: boolean; local?: boolean }) => {
    const git = simpleGit()
    const isLocal = options.local === true

    let targetPath: string

    if (isLocal) {
      // Local: project's .gut/ folder
      const isRepo = await git.checkIsRepo()
      if (!isRepo) {
        console.error(chalk.red('Error: Not a git repository'))
        console.error(chalk.gray('Use --global to open global config folder'))
        process.exit(1)
      }

      const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())
      targetPath = join(repoRoot.trim(), '.gut')
    } else {
      // Global
      if (options.templates) {
        targetPath = join(homedir(), '.config', 'gut', 'templates')
      } else {
        targetPath = join(homedir(), '.config', 'gut')
      }
    }

    // Create directory if it doesn't exist
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true })
      console.log(chalk.green(`Created ${targetPath}`))
    }

    try {
      openFolder(targetPath)
      console.log(chalk.green(`Opened: ${targetPath}`))
    } catch (error) {
      console.error(chalk.red(`Failed to open folder: ${targetPath}`))
      console.error(chalk.gray((error as Error).message))
      process.exit(1)
    }
  })
