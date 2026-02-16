import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { execSync } from 'node:child_process'
import { generateBranchName, findTemplate } from '../lib/ai.js'
import { resolveProvider } from '../lib/credentials.js'
import { requireGhCli } from '../lib/gh.js'

function getIssueInfo(issueNumber: string): { title: string; body: string } | null {
  try {
    const result = execSync(`gh issue view ${issueNumber} --json title,body`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return JSON.parse(result)
  } catch {
    return null
  }
}

export const branchCommand = new Command('branch')
  .description('Generate a branch name from issue number or description')
  .argument('[issue]', 'Issue number (e.g., 123 or #123)')
  .option('-d, --description <description>', 'Use description instead of issue')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-t, --type <type>', 'Branch type (feature, fix, hotfix, chore, refactor)')
  .option('-c, --checkout', 'Create and checkout the branch')
  .action(async (issue, options) => {
    const git = simpleGit()
    const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    let description: string
    let issueNumber: string | undefined

    if (options.description) {
      // Use provided description
      description = options.description
    } else if (issue) {
      // Fetch issue from GitHub - check gh CLI first
      if (!requireGhCli()) {
        process.exit(1)
      }

      const cleanedIssue = issue.replace(/^#/, '')
      issueNumber = cleanedIssue
      const spinner = ora(`Fetching issue #${cleanedIssue}...`).start()

      const issueInfo = getIssueInfo(cleanedIssue)
      if (!issueInfo) {
        spinner.fail(`Could not fetch issue #${issueNumber}`)
        console.log(chalk.gray('Make sure you are authenticated: gh auth login'))
        process.exit(1)
      }

      spinner.stop()
      console.log(chalk.gray(`Issue: ${issueInfo.title}`))
      description = `${issueInfo.title}\n\n${issueInfo.body || ''}`
    } else {
      console.error(chalk.red('Error: Please provide an issue number or use -d for description'))
      console.log(chalk.gray('Usage:'))
      console.log(chalk.gray('  gut branch 123'))
      console.log(chalk.gray('  gut branch -d "add user authentication"'))
      process.exit(1)
    }

    const provider = await resolveProvider(options.provider)
    const template = findTemplate(repoRoot.trim(), 'branch')

    if (template) {
      console.log(chalk.gray('Using template from project...'))
    }

    const spinner = ora('Generating branch name...').start()

    try {
      const branchName = await generateBranchName(
        description,
        { provider, model: options.model },
        { type: options.type, issue: issueNumber },
        template || undefined
      )

      spinner.stop()

      console.log(chalk.bold('\nGenerated branch name:\n'))
      console.log(chalk.green(`  ${branchName}`))
      console.log()

      if (options.checkout) {
        await git.checkoutLocalBranch(branchName)
        console.log(chalk.green(`✓ Created and checked out branch: ${branchName}`))
      } else {
        const readline = await import('node:readline')
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('Create and checkout this branch? (y/N) '), resolve)
        })
        rl.close()

        if (answer.toLowerCase() === 'y') {
          await git.checkoutLocalBranch(branchName)
          console.log(chalk.green(`✓ Created and checked out branch: ${branchName}`))
        } else {
          console.log(chalk.gray('\nTo create manually:'))
          console.log(chalk.gray(`  git checkout -b ${branchName}`))
        }
      }
    } catch (error) {
      spinner.fail('Failed to generate branch name')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
