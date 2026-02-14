import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { generateDiffSummary, DiffSummary } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'

export const aiDiffCommand = new Command('ai-diff')
  .description('Get an AI-powered explanation of your changes')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-s, --staged', 'Explain only staged changes')
  .option('-c, --commit <hash>', 'Explain a specific commit')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = options.provider.toLowerCase() as Provider
    const spinner = ora('Getting diff...').start()

    try {
      let diff: string

      if (options.commit) {
        diff = await git.diff([`${options.commit}^`, options.commit])
        spinner.text = `Analyzing commit ${options.commit.slice(0, 7)}...`
      } else if (options.staged) {
        diff = await git.diff(['--cached'])
        spinner.text = 'Analyzing staged changes...'
      } else {
        diff = await git.diff()
        const stagedDiff = await git.diff(['--cached'])
        diff = stagedDiff + '\n' + diff
        spinner.text = 'Analyzing uncommitted changes...'
      }

      if (!diff.trim()) {
        spinner.info('No changes to analyze')
        process.exit(0)
      }

      spinner.text = 'AI is analyzing your changes...'

      const summary = await generateDiffSummary(diff, {
        provider,
        model: options.model
      })

      spinner.stop()

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2))
        return
      }

      printSummary(summary)
    } catch (error) {
      spinner.fail('Failed to analyze diff')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })

function printSummary(summary: DiffSummary) {
  console.log(chalk.bold('\n📝 Change Summary\n'))

  // Overall summary
  console.log(chalk.cyan('Overview:'))
  console.log(`  ${summary.summary}\n`)

  // Per-file changes
  if (summary.changes.length > 0) {
    console.log(chalk.cyan('Changes:'))
    for (const change of summary.changes) {
      console.log(`  ${chalk.yellow(change.file)}`)
      console.log(`    ${chalk.gray(change.description)}`)
    }
    console.log()
  }

  // Impact
  console.log(chalk.cyan('Impact:'))
  console.log(`  ${summary.impact}\n`)

  // Notes
  if (summary.notes && summary.notes.length > 0) {
    console.log(chalk.cyan('Notes:'))
    for (const note of summary.notes) {
      console.log(`  ${chalk.gray('•')} ${note}`)
    }
    console.log()
  }
}
