import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { generateChangelog, Changelog } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'

const CHANGELOG_PATHS = [
  '.gut/changelog-template.md',
  '.gut/CHANGELOG.md',
  'CHANGELOG.md',
  'HISTORY.md',
  'CHANGES.md',
  'changelog.md',
  'docs/CHANGELOG.md'
]

function findChangelog(repoRoot: string): string | null {
  for (const changelogPath of CHANGELOG_PATHS) {
    const fullPath = join(repoRoot, changelogPath)
    if (existsSync(fullPath)) {
      return readFileSync(fullPath, 'utf-8')
    }
  }
  return null
}

function formatChangelog(changelog: Changelog): string {
  const lines: string[] = []

  const header = changelog.version
    ? `## [${changelog.version}] - ${changelog.date}`
    : `## ${changelog.date}`

  lines.push(header)
  lines.push('')

  if (changelog.summary) {
    lines.push(changelog.summary)
    lines.push('')
  }

  for (const section of changelog.sections) {
    if (section.items.length > 0) {
      lines.push(`### ${section.type}`)
      for (const item of section.items) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

export const changelogCommand = new Command('changelog')
  .description('Generate a changelog from commits between refs')
  .argument('[from]', 'Starting ref (tag, branch, commit)', 'HEAD~10')
  .argument('[to]', 'Ending ref', 'HEAD')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-t, --tag <tag>', 'Generate changelog since this tag')
  .option('--json', 'Output as JSON')
  .action(async (from, to, options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = options.provider.toLowerCase() as Provider
    const spinner = ora('Analyzing commits...').start()

    try {
      // Handle --tag option
      let fromRef = from
      let toRef = to

      if (options.tag) {
        fromRef = options.tag
        toRef = 'HEAD'
      }

      // Get commits
      const log = await git.log({ from: fromRef, to: toRef })

      if (log.all.length === 0) {
        spinner.info('No commits found in range')
        process.exit(0)
      }

      spinner.text = `Found ${log.all.length} commits, generating changelog...`

      const commits = log.all.map((c) => ({
        hash: c.hash,
        message: c.message,
        author: c.author_name,
        date: c.date
      }))

      // Get diff
      const diff = await git.diff([`${fromRef}...${toRef}`])

      // Find existing changelog for style reference
      const repoRoot = await git.revparse(['--show-toplevel'])
      const existingChangelog = findChangelog(repoRoot.trim())

      // Extract template from existing changelog (first entry as reference)
      let template: string | undefined
      if (existingChangelog) {
        const firstEntryMatch = existingChangelog.match(/## \[?[\d.]+\]?[\s\S]*?(?=## \[?[\d.]+\]?|$)/)
        if (firstEntryMatch) {
          template = firstEntryMatch[0].slice(0, 1500)
        }
        spinner.text = 'Found existing changelog, matching style...'
      }

      const changelog = await generateChangelog(
        {
          commits,
          diff,
          fromRef,
          toRef,
          template
        },
        { provider, model: options.model }
      )

      spinner.stop()

      if (options.json) {
        console.log(JSON.stringify(changelog, null, 2))
        return
      }

      console.log(chalk.bold('\n📋 Generated Changelog\n'))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(formatChangelog(changelog))
      console.log(chalk.gray('─'.repeat(50)))

      console.log(chalk.gray(`\nRange: ${fromRef}..${toRef} (${commits.length} commits)`))

      if (existingChangelog) {
        console.log(chalk.gray('Style matched from existing CHANGELOG.md'))
      }
    } catch (error) {
      spinner.fail('Failed to generate changelog')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
