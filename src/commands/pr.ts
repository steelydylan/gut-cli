import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { Command } from 'commander'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { findTemplate, generatePRDescription } from '../lib/ai.js'
import { getLanguage } from '../lib/config.js'
import { resolveProvider } from '../lib/credentials.js'
import {
  getDefaultBranch,
  getExistingPrUrl,
  hasUpstreamBranch,
  isGhCliInstalled,
  pushBranchToOrigin
} from '../lib/gh.js'

// GitHub's conventional PR template paths (prioritized)
const GITHUB_PR_TEMPLATE_PATHS = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md'
]

function findPRTemplate(repoRoot: string): string | null {
  // First, check for GitHub's PR template
  for (const templatePath of GITHUB_PR_TEMPLATE_PATHS) {
    const fullPath = join(repoRoot, templatePath)
    if (existsSync(fullPath)) {
      return readFileSync(fullPath, 'utf-8')
    }
  }
  // Fall back to .gut/pr.md
  return findTemplate(repoRoot, 'pr')
}

export const prCommand = new Command('pr')
  .description('Generate a pull request title and description using AI')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
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

    const provider = await resolveProvider(options.provider)

    const spinner = ora('Analyzing branch...').start()

    try {
      // Get current branch
      const branchInfo = await git.branch()
      const currentBranch = branchInfo.current

      // Detect base branch
      let baseBranch = options.base
      if (!baseBranch) {
        // Try to get default branch from GitHub
        const ghDefaultBranch = getDefaultBranch()
        if (ghDefaultBranch) {
          baseBranch = ghDefaultBranch
        } else if (branchInfo.all.includes('main')) {
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
          diff
        },
        { provider, model: options.model, language: getLanguage() },
        template || undefined
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
          const fullText = `${title}\n\n${body}`
          execSync('pbcopy', { input: fullText })
          console.log(chalk.green('\n✓ Copied to clipboard'))
        } catch {
          console.log(chalk.yellow('\n⚠ Could not copy to clipboard'))
        }
      }

      // Check if gh CLI is installed
      const ghInstalled = isGhCliInstalled()

      if (!ghInstalled) {
        console.log(chalk.yellow('\n⚠ GitHub CLI (gh) is not installed'))
        console.log(chalk.gray('  To create PRs directly from gut, install gh CLI:'))
        console.log(chalk.gray('    brew install gh  (macOS)'))
        console.log(chalk.gray('    https://cli.github.com/'))
        if (!options.copy) {
          console.log(chalk.gray('\nTip: Use --copy to copy to clipboard'))
        }
      } else {
        const readline = await import('node:readline')

        // Check if remote branch exists
        if (!hasUpstreamBranch()) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          })

          const pushAnswer = await new Promise<string>((resolve) => {
            rl.question(
              chalk.cyan(`\nNo remote branch found. Push ${currentBranch} to origin? (y/N) `),
              resolve
            )
          })
          rl.close()

          if (pushAnswer.toLowerCase() !== 'y') {
            console.log(chalk.gray('Aborted. Push your branch first to create a PR.'))
            return
          }

          const pushSpinner = ora(`Pushing ${currentBranch} to origin...`).start()
          try {
            pushBranchToOrigin(currentBranch)
            pushSpinner.succeed(`Pushed ${currentBranch} to origin`)
          } catch (err) {
            pushSpinner.fail('Failed to push branch')
            if (err instanceof Error && 'stderr' in err) {
              const stderr = (err as { stderr: Buffer }).stderr?.toString?.() || ''
              if (stderr) {
                console.error(chalk.red(stderr.trim()))
              }
            }
            return
          }
        }

        // Check if PR already exists for this branch
        const existingPrUrl = getExistingPrUrl()
        const isUpdate = !!existingPrUrl

        // Always ask about creating/updating PR
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        let promptMessage: string
        if (isUpdate) {
          promptMessage = chalk.cyan(`\nUpdate existing PR? (${existingPrUrl}) (y/N) `)
        } else if (options.create) {
          promptMessage = chalk.cyan('\nCreate PR with this description? (y/N) ')
        } else {
          promptMessage = chalk.cyan('\nCreate PR with gh CLI? (y/N) ')
        }

        const answer = await new Promise<string>((resolve) => {
          rl.question(promptMessage, resolve)
        })
        rl.close()

        if (answer.toLowerCase() === 'y') {
          const actionSpinner = ora(isUpdate ? 'Updating PR...' : 'Creating PR...').start()
          try {
            // Escape quotes and backticks in title for shell safety
            const escapedTitle = title
              .replace(/"/g, '\\"')
              .replace(/`/g, '\\`')
              .replace(/\$/g, '\\$')

            let prUrl: string
            if (isUpdate) {
              // Update existing PR
              execSync(`gh pr edit --title "${escapedTitle}" --body-file -`, {
                stdio: ['pipe', 'pipe', 'pipe'],
                input: body
              })
              prUrl = existingPrUrl
              actionSpinner.succeed('PR updated successfully!')
            } else {
              // Create new PR
              const result = execSync(
                `gh pr create --title "${escapedTitle}" --body-file - --base ${baseBranch}`,
                {
                  stdio: ['pipe', 'pipe', 'pipe'],
                  input: body
                }
              )
              prUrl = result.toString().trim()
              actionSpinner.succeed('PR created successfully!')
            }
            if (prUrl) {
              console.log(chalk.green(`\n🔗 ${prUrl}`))
            }
          } catch (err) {
            actionSpinner.fail(isUpdate ? 'Failed to update PR' : 'Failed to create PR')
            if (err instanceof Error && 'stderr' in err) {
              const stderr = (err as { stderr: Buffer }).stderr?.toString?.() || ''
              if (stderr.includes('auth')) {
                console.error(chalk.gray('Make sure gh CLI is authenticated: gh auth login'))
              } else if (stderr) {
                console.error(chalk.red(stderr.trim()))
              }
            }
          }
        } else if (!options.copy) {
          console.log(chalk.gray('\nTip: Use --copy to copy to clipboard'))
        }
      }
    } catch (err) {
      spinner.fail('Failed to generate PR description')
      console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'))
      process.exit(1)
    }
  })
