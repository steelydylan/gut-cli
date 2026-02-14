import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { generateCodeReview, CodeReview } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'

export const aiReviewCommand = new Command('ai-review')
  .description('Get an AI code review of your changes')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-s, --staged', 'Review only staged changes')
  .option('-c, --commit <hash>', 'Review a specific commit')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const git = simpleGit()

    // Check if we're in a git repository
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
        // Review specific commit
        diff = await git.diff([`${options.commit}^`, options.commit])
        spinner.text = `Reviewing commit ${options.commit.slice(0, 7)}...`
      } else if (options.staged) {
        // Review staged changes
        diff = await git.diff(['--cached'])
        spinner.text = 'Reviewing staged changes...'
      } else {
        // Review all uncommitted changes
        diff = await git.diff()
        const stagedDiff = await git.diff(['--cached'])
        diff = stagedDiff + '\n' + diff
        spinner.text = 'Reviewing uncommitted changes...'
      }

      if (!diff.trim()) {
        spinner.info('No changes to review')
        process.exit(0)
      }

      spinner.text = 'AI is reviewing your code...'

      const review = await generateCodeReview(diff, {
        provider,
        model: options.model
      })

      spinner.stop()

      if (options.json) {
        console.log(JSON.stringify(review, null, 2))
        return
      }

      printReview(review)
    } catch (error) {
      spinner.fail('Failed to generate review')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })

function printReview(review: CodeReview) {
  console.log(chalk.bold('\n🔍 AI Code Review\n'))

  // Summary
  console.log(chalk.cyan('Summary:'))
  console.log(`  ${review.summary}\n`)

  // Issues
  if (review.issues.length > 0) {
    console.log(chalk.cyan('Issues Found:'))
    for (const issue of review.issues) {
      const severityColors = {
        critical: chalk.red,
        warning: chalk.yellow,
        suggestion: chalk.blue
      }
      const severityIcons = {
        critical: '🔴',
        warning: '🟡',
        suggestion: '💡'
      }

      const color = severityColors[issue.severity]
      const icon = severityIcons[issue.severity]

      console.log(`\n  ${icon} ${color(issue.severity.toUpperCase())}`)
      console.log(`     ${chalk.gray('File:')} ${issue.file}${issue.line ? `:${issue.line}` : ''}`)
      console.log(`     ${issue.message}`)
      if (issue.suggestion) {
        console.log(`     ${chalk.green('→')} ${issue.suggestion}`)
      }
    }
  } else {
    console.log(chalk.green('  ✓ No issues found!\n'))
  }

  // Positives
  if (review.positives.length > 0) {
    console.log(chalk.cyan('\nGood Practices:'))
    for (const positive of review.positives) {
      console.log(`  ${chalk.green('✓')} ${positive}`)
    }
  }

  // Stats
  const criticalCount = review.issues.filter((i) => i.severity === 'critical').length
  const warningCount = review.issues.filter((i) => i.severity === 'warning').length
  const suggestionCount = review.issues.filter((i) => i.severity === 'suggestion').length

  console.log(chalk.gray('\n─'.repeat(40)))
  console.log(
    `  ${chalk.red(criticalCount)} critical  ${chalk.yellow(warningCount)} warnings  ${chalk.blue(suggestionCount)} suggestions`
  )
  console.log()
}
