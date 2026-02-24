import chalk from 'chalk'
import { Command } from 'commander'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { findTemplate, generateCommitMessage } from '../lib/ai.js'
import { getLanguage } from '../lib/config.js'
import { resolveProvider } from '../lib/credentials.js'

export const commitCommand = new Command('commit')
  .description('Generate a commit message using AI')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-c, --commit', 'Automatically commit with the generated message')
  .option('-a, --all', 'Force stage all changes (default: auto-stage if nothing staged)')
  .action(async (options) => {
    const git = simpleGit()
    const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())

    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = await resolveProvider(options.provider)

    // Stage all changes if requested
    if (options.all) {
      await git.add('-A')
    }

    // Get staged diff
    let diff = await git.diff(['--cached'])

    // Auto-stage if no staged changes
    if (!diff.trim()) {
      const status = await git.status()
      const unstaged = await git.diff()
      const hasUntracked = status.not_added.length > 0 || status.created.length > 0

      if (!unstaged.trim() && !hasUntracked) {
        console.error(chalk.yellow('No changes to commit.'))
        process.exit(1)
      }
      console.log(chalk.gray('No staged changes, staging all changes...'))
      await git.add('-A')
      diff = await git.diff(['--cached'])
    }

    // Find template
    const template = findTemplate(repoRoot.trim(), 'commit')
    if (template) {
      console.log(chalk.gray('Using template from project...'))
    }

    const spinner = ora('Generating commit message...').start()

    try {
      const message = await generateCommitMessage(
        diff,
        { provider, model: options.model, language: getLanguage() },
        template || undefined
      )

      spinner.stop()

      console.log(chalk.bold('\nGenerated commit message:\n'))
      console.log(chalk.green(`  ${message.split('\n')[0]}`))
      if (message.includes('\n')) {
        const details = message.split('\n').slice(1).join('\n')
        console.log(
          chalk.gray(
            details
              .split('\n')
              .map((l) => `  ${l}`)
              .join('\n')
          )
        )
      }
      console.log()

      if (options.commit) {
        // Auto-commit
        await git.commit(message)
        console.log(chalk.green('✓ Committed successfully'))
      } else {
        // Ask for confirmation
        const readline = await import('node:readline')
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('Commit with this message? (y/N/e to edit) '), resolve)
        })
        rl.close()

        if (answer.toLowerCase() === 'y') {
          await git.commit(message)
          console.log(chalk.green('✓ Committed successfully'))
        } else if (answer.toLowerCase() === 'e') {
          // Open in editor
          console.log(chalk.gray('Opening editor...'))
          const { execSync } = await import('node:child_process')
          const editor = process.env.EDITOR || process.env.VISUAL || 'vi'

          // Write message to temp file
          const fs = await import('node:fs')
          const os = await import('node:os')
          const path = await import('node:path')
          const tmpFile = path.join(os.tmpdir(), 'gut-commit-msg.txt')
          fs.writeFileSync(tmpFile, message)

          execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' })

          const editedMessage = fs.readFileSync(tmpFile, 'utf-8').trim()
          fs.unlinkSync(tmpFile)

          if (editedMessage) {
            await git.commit(editedMessage)
            console.log(chalk.green('✓ Committed successfully'))
          } else {
            console.log(chalk.yellow('Commit cancelled (empty message)'))
          }
        } else {
          console.log(chalk.gray('Commit cancelled'))
          // Print the message for manual use
          console.log(chalk.gray('\nTo commit manually:'))
          console.log(chalk.gray(`  git commit -m "${message.split('\n')[0]}"`))
        }
      }
    } catch (error) {
      spinner.fail('Failed to generate commit message')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
