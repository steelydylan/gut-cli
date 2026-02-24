import chalk from 'chalk'
import { Command } from 'commander'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { findTemplate, generateBranchNameFromDiff } from '../lib/ai.js'
import { getLanguage } from '../lib/config.js'
import { resolveProvider } from '../lib/credentials.js'

export const checkoutCommand = new Command('checkout')
  .description('Generate a branch name from current diff and checkout')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-y, --yes', 'Skip confirmation and checkout directly')
  .option('-s, --staged', 'Use staged changes only instead of all changes')
  .action(async (options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())

    // Get diff
    const spinner = ora('Analyzing changes...').start()

    const status = await git.status()

    let diff: string
    if (options.staged) {
      diff = await git.diff(['--cached'])
    } else {
      // Get both staged and unstaged changes
      const stagedDiff = await git.diff(['--cached'])
      const unstagedDiff = await git.diff()
      diff = `${stagedDiff}\n${unstagedDiff}`
    }

    // Check if there are any changes (including untracked files)
    const hasChanges = diff.trim() || status.not_added.length > 0 || status.created.length > 0

    if (!hasChanges) {
      spinner.fail('No changes found')
      console.log(chalk.gray('Make some changes first, then run gut checkout'))
      process.exit(1)
    }

    // If only untracked files, add them to context
    if (!diff.trim() && (status.not_added.length > 0 || status.created.length > 0)) {
      const untrackedFiles = [...status.not_added, ...status.created]
      diff = `New files:\n${untrackedFiles.map((f) => `+ ${f}`).join('\n')}`
    }

    spinner.text = 'Generating branch name...'

    const provider = await resolveProvider(options.provider)
    const template = findTemplate(repoRoot.trim(), 'checkout')

    if (template) {
      console.log(chalk.gray('\nUsing template from project...'))
    }

    try {
      const branchName = await generateBranchNameFromDiff(
        diff,
        { provider, model: options.model, language: getLanguage() },
        template
      )

      spinner.stop()

      console.log(chalk.bold('\nGenerated branch name:\n'))
      console.log(chalk.green(`  ${branchName}`))
      console.log()

      if (options.yes) {
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
