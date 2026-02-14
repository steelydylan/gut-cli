import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { generateCommitMessage } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'

export const aiCommitCommand = new Command('ai-commit')
  .alias('commit')
  .description('Generate a commit message using AI')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-c, --commit', 'Automatically commit with the generated message')
  .option('-a, --all', 'Force stage all changes (default: auto-stage if nothing staged)')
  .action(async (options) => {
    const git = simpleGit()

    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = options.provider.toLowerCase() as Provider

    // Stage all changes if requested
    if (options.all) {
      await git.add('-A')
    }

    // Get staged diff
    let diff = await git.diff(['--cached'])

    // Auto-stage if no staged changes
    if (!diff.trim()) {
      const unstaged = await git.diff()
      if (!unstaged.trim()) {
        console.error(chalk.yellow('No changes to commit.'))
        process.exit(1)
      }
      console.log(chalk.gray('No staged changes, staging all changes...'))
      await git.add('-A')
      diff = await git.diff(['--cached'])
    }

    const spinner = ora('Generating commit message...').start()

    try {
      const message = await generateCommitMessage(diff, {
        provider,
        model: options.model
      })

      spinner.stop()

      console.log(chalk.bold('\nGenerated commit message:\n'))
      console.log(chalk.green(`  ${message.split('\n')[0]}`))
      if (message.includes('\n')) {
        const details = message.split('\n').slice(1).join('\n')
        console.log(chalk.gray(details.split('\n').map(l => `  ${l}`).join('\n')))
      }
      console.log()

      if (options.commit) {
        // Auto-commit
        await git.commit(message)
        console.log(chalk.green('✓ Committed successfully'))
      } else {
        // Ask for confirmation
        const readline = await import('readline')
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
          const { execSync } = await import('child_process')
          const editor = process.env.EDITOR || process.env.VISUAL || 'vi'

          // Write message to temp file
          const fs = await import('fs')
          const os = await import('os')
          const path = await import('path')
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
