import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { generatePRDescription } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'

const PR_TEMPLATE_PATHS = [
  '.gut/pr-template.md',
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md'
]

function findPRTemplate(repoRoot: string): string | null {
  for (const templatePath of PR_TEMPLATE_PATHS) {
    const fullPath = join(repoRoot, templatePath)
    if (existsSync(fullPath)) {
      return readFileSync(fullPath, 'utf-8')
    }
  }
  return null
}

export const aiPrCommand = new Command('ai-pr')
  .alias('pr')
  .description('Generate a pull request title and description using AI')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-b, --base <branch>', 'Base branch to compare against (default: main or master)')
  .option('--create', 'Create the PR using gh CLI')
  .option('--copy', 'Copy the description to clipboard')
  .action(async (options) => {
    const git = simpleGit()

    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = options.provider.toLowerCase() as Provider

    const spinner = ora('Analyzing branch...').start()

    try {
      // Get current branch
      const branchInfo = await git.branch()
      const currentBranch = branchInfo.current

      // Detect base branch
      let baseBranch = options.base
      if (!baseBranch) {
        if (branchInfo.all.includes('main')) {
          baseBranch = 'main'
        } else if (branchInfo.all.includes('master')) {
          baseBranch = 'master'
        } else {
          baseBranch = 'main'
        }
      }

      if (currentBranch === baseBranch) {
        spinner.fail(`Already on ${baseBranch} branch`)
        process.exit(1)
      }

      spinner.text = `Comparing ${currentBranch} to ${baseBranch}...`

      // Get commits
      const log = await git.log({ from: baseBranch, to: currentBranch })
      const commits = log.all.map((c) => c.message.split('\n')[0])

      if (commits.length === 0) {
        spinner.fail('No commits found between branches')
        process.exit(1)
      }

      // Get diff
      const diff = await git.diff([`${baseBranch}...${currentBranch}`])

      // Find PR template
      const repoRoot = await git.revparse(['--show-toplevel'])
      const template = findPRTemplate(repoRoot.trim())

      if (template) {
        spinner.text = 'Found PR template, generating description...'
      } else {
        spinner.text = 'Generating PR description...'
      }

      const { title, body } = await generatePRDescription(
        {
          baseBranch,
          currentBranch,
          commits,
          diff,
          template: template || undefined
        },
        {
          provider,
          model: options.model
        }
      )

      spinner.stop()

      console.log(chalk.bold('\n📝 Generated PR:\n'))
      console.log(chalk.cyan('Title:'), chalk.white(title))
      console.log(chalk.cyan('\nDescription:'))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(body)
      console.log(chalk.gray('─'.repeat(50)))

      if (options.copy) {
        try {
          const { execSync } = await import('child_process')
          const fullText = `${title}\n\n${body}`
          execSync('pbcopy', { input: fullText })
          console.log(chalk.green('\n✓ Copied to clipboard'))
        } catch {
          console.log(chalk.yellow('\n⚠ Could not copy to clipboard'))
        }
      }

      if (options.create) {
        const readline = await import('readline')
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('\nCreate PR with this description? (y/N) '), resolve)
        })
        rl.close()

        if (answer.toLowerCase() === 'y') {
          const createSpinner = ora('Creating PR...').start()
          try {
            const { execSync } = await import('child_process')

            // Escape quotes in title and body
            const escapedTitle = title.replace(/"/g, '\\"')
            const escapedBody = body.replace(/"/g, '\\"')

            execSync(
              `gh pr create --title "${escapedTitle}" --body "${escapedBody}" --base ${baseBranch}`,
              { stdio: 'pipe' }
            )
            createSpinner.succeed('PR created successfully!')
          } catch (error) {
            createSpinner.fail('Failed to create PR')
            console.error(chalk.gray('Make sure gh CLI is installed and authenticated'))
          }
        }
      }

      if (!options.copy && !options.create) {
        console.log(chalk.gray('\nOptions:'))
        console.log(chalk.gray('  --copy    Copy to clipboard'))
        console.log(chalk.gray('  --create  Create PR with gh CLI'))
      }
    } catch (error) {
      spinner.fail('Failed to generate PR description')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
