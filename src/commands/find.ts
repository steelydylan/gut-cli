import chalk from 'chalk'
import { Command } from 'commander'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { type CommitSearchResult, findTemplate, searchCommits } from '../lib/ai.js'
import { getBaseUrl } from '../lib/config.js'
import { resolveProvider } from '../lib/credentials.js'

export const findCommand = new Command('find')
  .description('Find commits matching a vague description using AI')
  .argument(
    '<query>',
    'Description of the change you are looking for (e.g., "login feature added")'
  )
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('--base-url <url>', 'Base URL for API provider')
  .option('-n, --num <n>', 'Number of commits to search through', '100')
  .option('--path <path>', 'Limit search to commits affecting this path')
  .option('--author <author>', 'Limit search to commits by this author')
  .option('--since <date>', 'Limit search to commits after this date')
  .option('--until <date>', 'Limit search to commits before this date')
  .option('--max-results <n>', 'Maximum number of matching commits to return', '5')
  .option('--json', 'Output as JSON')
  .action(async (query, options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = await resolveProvider(options.provider)
    const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())
    const spinner = ora('Searching commits...').start()

    try {
      // Build log options
      const logOptions: string[] = [`-n`, options.num]

      if (options.path) {
        logOptions.push('--', options.path)
      }
      if (options.author) {
        logOptions.push(`--author=${options.author}`)
      }
      if (options.since) {
        logOptions.push(`--since=${options.since}`)
      }
      if (options.until) {
        logOptions.push(`--until=${options.until}`)
      }

      // Get commit history
      spinner.text = `Fetching last ${options.num} commits...`
      const log = await git.log(logOptions)

      if (log.all.length === 0) {
        spinner.fail('No commits found matching the criteria')
        process.exit(1)
      }

      spinner.text = `Analyzing ${log.all.length} commits with AI...`

      // Prepare commits for AI
      const commits = log.all.map((c) => ({
        hash: c.hash,
        message: c.message,
        author: c.author_name,
        email: c.author_email,
        date: c.date
      }))

      // Find template
      const template = findTemplate(repoRoot.trim(), 'find')

      // Search with AI
      const results = await searchCommits(
        query,
        commits,
        {
          provider,
          model: options.model,
          baseUrl: options.baseUrl || getBaseUrl()
        },
        parseInt(options.maxResults, 10),
        template || undefined
      )

      spinner.stop()

      if (results.matches.length === 0) {
        console.log(chalk.yellow('\nNo matching commits found for your query.'))
        console.log(chalk.gray(`Searched ${commits.length} commits.`))
        process.exit(0)
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2))
        return
      }

      printResults(results, query)
    } catch (error) {
      spinner.fail('Failed to search commits')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })

function printResults(results: CommitSearchResult, query: string) {
  console.log(chalk.bold(`\n🔍 Found ${results.matches.length} matching commit(s)\n`))
  console.log(chalk.gray(`Query: "${query}"\n`))

  for (let i = 0; i < results.matches.length; i++) {
    const match = results.matches[i]
    const num = i + 1

    console.log(chalk.cyan(`📝 Commit ${num}`))
    console.log(`  ${chalk.gray('Hash:')}    ${chalk.yellow(match.hash.slice(0, 7))}`)
    console.log(`  ${chalk.gray('Message:')} ${match.message.split('\n')[0]}`)
    console.log(`  ${chalk.gray('Author:')}  ${match.author} <${match.email}>`)
    console.log(`  ${chalk.gray('Date:')}    ${match.date}`)
    console.log(`  ${chalk.gray('Reason:')}  ${chalk.green(match.reason)}`)

    if (match.relevance) {
      const relevanceColor =
        match.relevance === 'high'
          ? chalk.green
          : match.relevance === 'medium'
            ? chalk.yellow
            : chalk.gray
      console.log(`  ${chalk.gray('Match:')}   ${relevanceColor(match.relevance)}`)
    }

    console.log()
  }

  if (results.summary) {
    console.log(chalk.gray('---'))
    console.log(chalk.gray(`Summary: ${results.summary}`))
  }
}
