import chalk from 'chalk'
import { Command } from 'commander'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { type Changelog, findTemplate, generateChangelog } from '../lib/ai.js'
import { getBaseUrl } from '../lib/config.js'
import { resolveProvider } from '../lib/credentials.js'

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
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('--base-url <url>', 'Base URL for API provider')
  .option('-t, --tag <tag>', 'Generate changelog since this tag')
  .option('--json', 'Output as JSON')
  .action(async (from, to, options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = await resolveProvider(options.provider)
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

      // Find template
      const repoRoot = await git.revparse(['--show-toplevel'])
      const template = findTemplate(repoRoot.trim(), 'changelog')

      if (template) {
        spinner.text = 'Using template from project...'
      }

      const changelog = await generateChangelog(
        { commits, diff, fromRef, toRef },
        {
          provider,
          model: options.model,
          baseUrl: options.baseUrl || getBaseUrl()
        },
        template || undefined
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

      if (template) {
        console.log(chalk.gray('Style matched from existing CHANGELOG.md'))
      }
    } catch (error) {
      spinner.fail('Failed to generate changelog')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
