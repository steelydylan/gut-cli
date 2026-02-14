import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { generateWorkSummary, WorkSummary } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'

export const summaryCommand = new Command('summary')
  .description('Generate a work summary from your commits (for daily/weekly reports)')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('--since <date>', 'Start date (default: today)', 'today')
  .option('--until <date>', 'End date')
  .option('--author <author>', 'Filter by author (default: current user)')
  .option('--daily', 'Generate daily report (alias for --since today)')
  .option('--weekly', 'Generate weekly report (alias for --since "1 week ago")')
  .option('--with-diff', 'Include diff analysis for more detail')
  .option('--markdown', 'Output as markdown')
  .option('--json', 'Output as JSON')
  .option('--copy', 'Copy to clipboard')
  .action(async (options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = options.provider.toLowerCase() as Provider
    const spinner = ora('Generating summary...').start()

    try {
      // Get current user if no author specified
      let author = options.author
      if (!author) {
        const config = await git.listConfig()
        author = config.all['user.name'] as string || ''
        if (!author) {
          spinner.fail('Could not determine git user. Use --author to specify.')
          process.exit(1)
        }
      }

      // Determine date range
      let since = options.since
      let format: 'daily' | 'weekly' | 'custom' = 'custom'

      if (options.daily) {
        since = 'today'
        format = 'daily'
      } else if (options.weekly) {
        since = '1 week ago'
        format = 'weekly'
      } else if (since === 'today') {
        format = 'daily'
      }

      // Convert relative dates to absolute for better compatibility
      const sinceDate = resolveDate(since)

      spinner.text = `Fetching commits by ${author} since ${since}...`

      // Build log options
      const logOptions: string[] = [`--author=${author}`, `--since=${sinceDate}`]
      if (options.until) {
        logOptions.push(`--until=${resolveDate(options.until)}`)
      }

      const log = await git.log(logOptions)

      if (log.all.length === 0) {
        spinner.info(`No commits found for ${author} since ${since}`)
        process.exit(0)
      }

      spinner.text = `Analyzing ${log.all.length} commits...`

      // Get diff if requested
      let diff: string | undefined
      if (options.withDiff && log.all.length > 0) {
        const oldest = log.all[log.all.length - 1].hash
        const newest = log.all[0].hash
        try {
          diff = await git.diff([`${oldest}^`, newest])
        } catch {
          // If oldest^ doesn't exist (first commit), skip diff
        }
      }

      const commits = log.all.map((c) => ({
        hash: c.hash,
        message: c.message,
        date: c.date
      }))

      const summary = await generateWorkSummary(
        {
          commits,
          author,
          since,
          until: options.until,
          diff
        },
        { provider, model: options.model },
        format
      )

      spinner.stop()

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2))
        return
      }

      const output = options.markdown ? formatMarkdown(summary, author, since, options.until) : null

      if (options.copy) {
        const textToCopy = output || formatMarkdown(summary, author, since, options.until)
        const { execSync } = await import('child_process')
        try {
          execSync('pbcopy', { input: textToCopy })
          console.log(chalk.green('Summary copied to clipboard!'))
          console.log()
        } catch {
          console.log(chalk.yellow('Could not copy to clipboard'))
        }
      }

      if (options.markdown) {
        console.log(output)
      } else {
        printSummary(summary, author, since, options.until)
      }
    } catch (error) {
      spinner.fail('Failed to generate summary')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })

function formatMarkdown(summary: WorkSummary, author: string, since: string, until?: string): string {
  const lines: string[] = []
  const period = until ? `${since} - ${until}` : `${since} - now`

  lines.push(`# ${summary.title}`)
  lines.push('')
  lines.push(`**Author:** ${author}`)
  lines.push(`**Period:** ${period}`)
  if (summary.stats) {
    lines.push(`**Commits:** ${summary.stats.commits}`)
  }
  lines.push('')
  lines.push('## Overview')
  lines.push(summary.overview)
  lines.push('')

  if (summary.highlights.length > 0) {
    lines.push('## Highlights')
    for (const highlight of summary.highlights) {
      lines.push(`- ${highlight}`)
    }
    lines.push('')
  }

  if (summary.details.length > 0) {
    lines.push('## Details')
    for (const section of summary.details) {
      lines.push(`### ${section.category}`)
      for (const item of section.items) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

function resolveDate(dateStr: string): string {
  const now = new Date()

  if (dateStr === 'today') {
    return formatDate(now)
  } else if (dateStr === 'yesterday') {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return formatDate(d)
  } else if (dateStr.match(/^(\d+)\s+(day|days)\s+ago$/i)) {
    const match = dateStr.match(/^(\d+)\s+(day|days)\s+ago$/i)!
    const days = parseInt(match[1], 10)
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return formatDate(d)
  } else if (dateStr.match(/^(\d+)\s+(week|weeks)\s+ago$/i)) {
    const match = dateStr.match(/^(\d+)\s+(week|weeks)\s+ago$/i)!
    const weeks = parseInt(match[1], 10)
    const d = new Date(now)
    d.setDate(d.getDate() - weeks * 7)
    return formatDate(d)
  }

  // Return as-is if it's already a date string
  return dateStr
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day} 00:00:00`
}

function printSummary(summary: WorkSummary, author: string, since: string, until?: string) {
  const period = until ? `${since} - ${until}` : `${since} - now`

  console.log(chalk.bold(`\n📊 ${summary.title}\n`))
  console.log(chalk.gray(`Author: ${author}`))
  console.log(chalk.gray(`Period: ${period}`))
  if (summary.stats) {
    console.log(chalk.gray(`Commits: ${summary.stats.commits}`))
  }
  console.log()

  console.log(chalk.cyan('Overview:'))
  console.log(`  ${summary.overview}`)
  console.log()

  if (summary.highlights.length > 0) {
    console.log(chalk.cyan('Highlights:'))
    for (const highlight of summary.highlights) {
      console.log(`  ${chalk.green('★')} ${highlight}`)
    }
    console.log()
  }

  if (summary.details.length > 0) {
    console.log(chalk.cyan('Details:'))
    for (const section of summary.details) {
      console.log(`  ${chalk.yellow(section.category)}`)
      for (const item of section.items) {
        console.log(`    • ${item}`)
      }
    }
    console.log()
  }
}
