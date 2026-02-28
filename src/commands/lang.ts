import chalk from 'chalk'
import { Argument, Command } from 'commander'
import {
  getLanguage,
  getLocalConfig,
  isValidLanguage,
  setLanguage,
  VALID_LANGUAGES
} from '../lib/config.js'

export const langCommand = new Command('lang')
  .description('Set or show output language')
  .addArgument(new Argument('[language]', 'Language to set').choices([...VALID_LANGUAGES]))
  .option('--local', 'Set for current repository only')
  .action((language: string | undefined, options: { local?: boolean }) => {
    if (!language) {
      // Show current language
      const lang = getLanguage()
      const localConfig = getLocalConfig()
      const isLocal = 'lang' in localConfig
      const scope = isLocal ? chalk.cyan('(local)') : chalk.gray('(global)')
      console.log(`${lang} ${scope}`)
      return
    }

    if (!isValidLanguage(language)) {
      console.error(chalk.red(`Invalid language: ${language}`))
      console.error(chalk.gray(`Valid languages: ${VALID_LANGUAGES.join(', ')}`))
      process.exit(1)
    }

    try {
      setLanguage(language, options.local ?? false)
      const scope = options.local ? '(local)' : '(global)'
      console.log(chalk.green(`✓ Language set to: ${language} ${scope}`))
    } catch (err) {
      console.error(chalk.red((err as Error).message))
      process.exit(1)
    }
  })
