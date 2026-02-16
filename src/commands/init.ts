import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { getApiKey, resolveProvider } from '../lib/credentials.js'
import { getLanguage, getDefaultModel } from '../lib/config.js'

function openFolder(path: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' :
              platform === 'win32' ? 'start ""' : 'xdg-open'
  execSync(`${cmd} "${path}"`)
}

// Get gut's root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const GUT_ROOT = join(__dirname, '..')

const TEMPLATE_FILES = [
  'branch.md',
  'changelog.md',
  'checkout.md',
  'commit.md',
  'explain.md',
  'explain-file.md',
  'find.md',
  'merge.md',
  'pr.md',
  'review.md',
  'stash.md',
  'summary.md'
]

async function translateTemplate(
  content: string,
  targetLang: string,
  provider: Provider
): Promise<string> {
  const apiKey = await getApiKey(provider)
  if (!apiKey) {
    throw new Error(`No API key found for ${provider}`)
  }

  const modelName = getDefaultModel(provider)

  let model
  switch (provider) {
    case 'gemini': {
      const google = createGoogleGenerativeAI({ apiKey })
      model = google(modelName)
      break
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey })
      model = openai(modelName)
      break
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey })
      model = anthropic(modelName)
      break
    }
    default:
      throw new Error(`Unsupported provider for translation: ${provider}`)
  }

  const langNames: Record<string, string> = {
    ja: 'Japanese',
    en: 'English',
    zh: 'Chinese',
    ko: 'Korean',
    es: 'Spanish',
    fr: 'French',
    de: 'German'
  }

  const targetLangName = langNames[targetLang] || targetLang

  const { text } = await generateText({
    model,
    prompt: `Translate the following prompt template to ${targetLangName}.
Keep all {{variable}} placeholders exactly as they are - do not translate them.
Keep the markdown formatting intact.
Only translate the instructional text.

Template to translate:
${content}

Translated template:`
  })

  return text.trim()
}

export const initCommand = new Command('init')
  .description('Initialize .gut/ templates in your project or globally')
  .option('-p, --provider <provider>', 'AI provider for translation (gemini, openai, anthropic, ollama)')
  .option('-f, --force', 'Overwrite existing templates')
  .option('-g, --global', 'Initialize templates globally (~/.config/gut/templates/)')
  .option('-o, --open', 'Open the templates folder (can be used alone)')
  .option('--no-translate', 'Skip translation even if language is not English')
  .action(async (options) => {
    const isGlobal = options.global === true
    const git = simpleGit()

    let targetDir: string

    if (isGlobal) {
      // Global templates: ~/.config/gut/templates/
      targetDir = join(homedir(), '.config', 'gut', 'templates')
    } else {
      // Project templates: .gut/
      const isRepo = await git.checkIsRepo()
      if (!isRepo) {
        console.error(chalk.red('Error: Not a git repository'))
        console.error(chalk.gray('Use --global to initialize templates globally'))
        process.exit(1)
      }

      const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())
      targetDir = join(repoRoot.trim(), '.gut')
    }

    // Create target directory if it doesn't exist
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
      console.log(chalk.green(`Created ${targetDir}`))
    }

    console.log(chalk.blue(isGlobal ? 'Initializing global templates...\n' : 'Initializing project templates...\n'))

    const sourceDir = join(GUT_ROOT, '.gut')
    const lang = getLanguage()
    // Check if pre-translated templates exist for this language
    const langSourceDir = join(GUT_ROOT, '.gut', lang)
    const hasPreTranslated = lang !== 'en' && existsSync(langSourceDir)
    const needsTranslation = options.translate !== false && lang !== 'en' && !hasPreTranslated
    const provider = needsTranslation ? await resolveProvider(options.provider) : null

    if (hasPreTranslated) {
      console.log(chalk.gray(`Language: ${lang} - using pre-translated templates\n`))
    } else if (needsTranslation) {
      console.log(chalk.gray(`Language: ${lang} - templates will be translated\n`))
    }

    const spinner = ora()
    let copied = 0
    let skipped = 0

    for (const filename of TEMPLATE_FILES) {
      // Try language-specific template first, then fall back to default
      const langSourcePath = join(langSourceDir, filename)
      const defaultSourcePath = join(sourceDir, filename)
      const sourcePath = hasPreTranslated && existsSync(langSourcePath) ? langSourcePath : defaultSourcePath
      const targetPath = join(targetDir, filename)

      if (!existsSync(sourcePath)) {
        continue
      }

      if (existsSync(targetPath) && !options.force) {
        console.log(chalk.gray(`  Skipped: ${filename} (already exists)`))
        skipped++
        continue
      }

      let content = readFileSync(sourcePath, 'utf-8')

      // Only translate if no pre-translated template exists and translation is needed
      if (needsTranslation && sourcePath === defaultSourcePath && provider) {
        spinner.start(`Translating ${filename}...`)
        try {
          content = await translateTemplate(content, lang, provider)
          spinner.succeed(`Translated: ${filename}`)
        } catch (err) {
          spinner.fail(`Failed to translate ${filename}`)
          console.error(chalk.red(`  ${err instanceof Error ? err.message : 'Unknown error'}`))
          // Fall back to original content
          console.log(chalk.gray(`  Using original English template`))
        }
      } else {
        console.log(chalk.green(`  Copied: ${filename}`))
      }

      writeFileSync(targetPath, content)
      copied++
    }

    console.log()
    if (copied > 0) {
      const location = isGlobal ? '~/.config/gut/templates/' : '.gut/'
      console.log(chalk.green(`✓ ${copied} template(s) initialized in ${location}`))
    }
    if (skipped > 0) {
      console.log(chalk.gray(`  ${skipped} template(s) skipped (use --force to overwrite)`))
    }

    if (isGlobal) {
      console.log(chalk.gray('\nGlobal templates will be used as fallback for all projects.'))
      console.log(chalk.gray('Project-level templates (.gut/) take priority over global templates.'))
    } else {
      console.log(chalk.gray('\nYou can now customize these templates for your project.'))
    }

    // Open folder if --open was specified
    if (options.open) {
      try {
        openFolder(targetDir)
        console.log(chalk.green(`\nOpened: ${targetDir}`))
      } catch {
        console.error(chalk.red(`\nFailed to open folder: ${targetDir}`))
      }
    }
  })
