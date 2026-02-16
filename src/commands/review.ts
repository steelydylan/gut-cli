import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { execSync } from 'node:child_process'
import { generateCodeReview, type CodeReview, findTemplate } from '../lib/ai.js'
import { resolveProvider } from '../lib/credentials.js'
import { requireGhCli } from '../lib/gh.js'

interface PRInfo {
  number: number
  title: string
  author: string
  url: string
}

async function getPRDiff(prNumber: string): Promise<{ diff: string; prInfo: PRInfo }> {
  try {
    const diff = execSync(`gh pr diff ${prNumber}`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    const prJsonStr = execSync(`gh pr view ${prNumber} --json number,title,author,url`, { encoding: 'utf-8' })
    const prJson = JSON.parse(prJsonStr)
    return {
      diff,
      prInfo: {
        number: prJson.number,
        title: prJson.title,
        author: prJson.author.login,
        url: prJson.url
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('gh: command not found')) {
      throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/', { cause: err })
    }
    throw err
  }
}

export const reviewCommand = new Command('review')
  .description('Get an AI code review of your changes or a GitHub PR')
  .argument('[pr-number]', 'GitHub PR number to review')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-s, --staged', 'Review only staged changes')
  .option('-c, --commit <hash>', 'Review a specific commit')
  .option('--json', 'Output as JSON')
  .action(async (prNumber, options) => {
    const git = simpleGit()

    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = await resolveProvider(options.provider)

    const spinner = ora('Getting diff...').start()

    try {
      let diff: string
      let prInfo: PRInfo | null = null

      if (prNumber) {
        // Review GitHub PR - check gh CLI first
        spinner.stop()
        if (!requireGhCli()) {
          process.exit(1)
        }
        spinner.start(`Fetching PR #${prNumber}...`)
        const result = await getPRDiff(prNumber)
        diff = result.diff
        prInfo = result.prInfo
        spinner.text = `Reviewing PR #${prNumber}...`
      } else if (options.commit) {
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
        diff = `${stagedDiff}\n${diff}`
        spinner.text = 'Reviewing uncommitted changes...'
      }

      if (!diff.trim()) {
        spinner.info('No changes to review')
        process.exit(0)
      }

      spinner.text = 'AI is reviewing your code...'

      const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())
      const template = findTemplate(repoRoot.trim(), 'review')

      const review = await generateCodeReview(
        diff,
        { provider, model: options.model },
        template || undefined
      )

      spinner.stop()

      if (options.json) {
        console.log(JSON.stringify({ prInfo, review }, null, 2))
        return
      }

      if (prInfo) {
        console.log(chalk.bold(`\n🔗 PR #${prInfo.number}: ${prInfo.title}`))
        console.log(chalk.gray(`   by ${prInfo.author} - ${prInfo.url}`))
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
