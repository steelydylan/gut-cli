import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { Command } from 'commander'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { findTemplate, generateGitignore } from '../lib/ai.js'
import { getLanguage } from '../lib/config.js'
import { resolveProvider } from '../lib/credentials.js'

// Config files that indicate language/framework
const CONFIG_FILES = [
  // JavaScript/TypeScript
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.mjs',
  'nuxt.config.ts',
  'astro.config.mjs',
  // Python
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'Pipfile',
  'poetry.lock',
  // Go
  'go.mod',
  'go.sum',
  // Rust
  'Cargo.toml',
  'Cargo.lock',
  // Java/Kotlin
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  // Ruby
  'Gemfile',
  'Gemfile.lock',
  // PHP
  'composer.json',
  'composer.lock',
  // .NET
  '*.csproj',
  '*.fsproj',
  '*.sln',
  // Elixir
  'mix.exs',
  // Dart/Flutter
  'pubspec.yaml',
  // Swift
  'Package.swift'
]

function getFiles(dir: string, maxDepth: number = 3, currentDepth: number = 0): string[] {
  if (currentDepth >= maxDepth) return []

  const files: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      // Skip hidden files/dirs and common large directories
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'vendor' ||
        entry.name === 'target' ||
        entry.name === '__pycache__' ||
        entry.name === 'venv' ||
        entry.name === '.venv'
      ) {
        continue
      }

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(`${entry.name}/`)
        const subFiles = getFiles(fullPath, maxDepth, currentDepth + 1)
        files.push(...subFiles.map((f) => `${entry.name}/${f}`))
      } else {
        files.push(entry.name)
      }
    }
  } catch {
    // Ignore permission errors
  }
  return files
}

function findConfigFiles(repoRoot: string): Map<string, string> {
  const found = new Map<string, string>()

  for (const configFile of CONFIG_FILES) {
    if (configFile.includes('*')) {
      // Handle glob patterns like *.csproj
      const ext = configFile.replace('*', '')
      try {
        const entries = readdirSync(repoRoot)
        for (const entry of entries) {
          if (entry.endsWith(ext)) {
            const content = readFileSync(join(repoRoot, entry), 'utf-8')
            found.set(entry, content.slice(0, 2000))
          }
        }
      } catch {
        // Ignore
      }
    } else {
      const filePath = join(repoRoot, configFile)
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8')
          found.set(configFile, content.slice(0, 2000))
        } catch {
          // Ignore
        }
      }
    }
  }

  return found
}

export const gitignoreCommand = new Command('gitignore')
  .description('Generate .gitignore from current codebase')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-o, --output <file>', 'Output file (default: .gitignore)', '.gitignore')
  .option('--stdout', 'Print to stdout instead of file')
  .option('-y, --yes', 'Overwrite existing .gitignore without confirmation')
  .action(async (options) => {
    const git = simpleGit()
    const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())
    const root = repoRoot.trim()

    const provider = await resolveProvider(options.provider)
    const template = findTemplate(root, 'gitignore')

    if (template) {
      console.log(chalk.gray('Using template from project...'))
    }

    // Gather project info
    const spinner = ora('Analyzing project structure...').start()

    const files = getFiles(root)
    const configFiles = findConfigFiles(root)

    // Check for existing .gitignore
    const gitignorePath = join(root, options.output)
    let existingGitignore: string | undefined
    if (existsSync(gitignorePath)) {
      existingGitignore = readFileSync(gitignorePath, 'utf-8')
    }

    // Format config files for prompt
    let configFilesStr = ''
    if (configFiles.size > 0) {
      const entries: string[] = []
      for (const [name, content] of configFiles) {
        entries.push(`### ${name}\n\`\`\`\n${content}\n\`\`\``)
      }
      configFilesStr = entries.join('\n\n')
    }

    spinner.text = 'Generating .gitignore...'

    try {
      const gitignoreContent = await generateGitignore(
        {
          files: files.slice(0, 200).join('\n'),
          configFiles: configFilesStr,
          existingGitignore
        },
        { provider, model: options.model, language: getLanguage() },
        template || undefined
      )

      spinner.stop()

      if (options.stdout) {
        console.log(gitignoreContent)
        return
      }

      console.log(chalk.bold('\nGenerated .gitignore:\n'))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(gitignoreContent)
      console.log(chalk.gray('─'.repeat(50)))
      console.log()

      // Check if file exists and confirm overwrite
      if (existsSync(gitignorePath) && !options.yes) {
        const readline = await import('node:readline')
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan(`${options.output} already exists. Overwrite? (y/N) `), resolve)
        })
        rl.close()

        if (answer.toLowerCase() !== 'y') {
          console.log(chalk.gray('Aborted.'))
          return
        }
      }

      writeFileSync(gitignorePath, gitignoreContent)
      console.log(chalk.green(`✓ Wrote ${options.output}`))
    } catch (error) {
      spinner.fail('Failed to generate .gitignore')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
