import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { generateStashName, findTemplate } from '../lib/ai.js'
import { resolveProvider } from '../lib/credentials.js'

export const stashCommand = new Command('stash')
  .description('Stash changes with AI-generated name')
  .argument('[name]', 'Custom stash name (skips AI generation)')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic, ollama)')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-l, --list', 'List all stashes')
  .option('-a, --apply [index]', 'Apply stash (default: latest)')
  .option('--pop [index]', 'Pop stash (default: latest)')
  .option('-d, --drop [index]', 'Drop stash')
  .option('--clear', 'Clear all stashes')
  .action(async (name, options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    // List stashes
    if (options.list) {
      const stashList = await git.stashList()
      if (stashList.all.length === 0) {
        console.log(chalk.gray('No stashes found'))
        return
      }
      console.log(chalk.bold('\nStashes:\n'))
      stashList.all.forEach((stash, index) => {
        console.log(`  ${chalk.cyan(index.toString())} ${stash.message}`)
      })
      console.log()
      return
    }

    // Apply stash
    if (options.apply !== undefined) {
      const index = typeof options.apply === 'string' ? options.apply : '0'
      try {
        await git.stash(['apply', `stash@{${index}}`])
        console.log(chalk.green(`✓ Applied stash@{${index}}`))
      } catch (err) {
        console.error(chalk.red(`Failed to apply stash: ${err instanceof Error ? err.message : 'Unknown error'}`))
        process.exit(1)
      }
      return
    }

    // Pop stash
    if (options.pop !== undefined) {
      const index = typeof options.pop === 'string' ? options.pop : '0'
      try {
        await git.stash(['pop', `stash@{${index}}`])
        console.log(chalk.green(`✓ Popped stash@{${index}}`))
      } catch (err) {
        console.error(chalk.red(`Failed to pop stash: ${err instanceof Error ? err.message : 'Unknown error'}`))
        process.exit(1)
      }
      return
    }

    // Drop stash
    if (options.drop !== undefined) {
      const index = typeof options.drop === 'string' ? options.drop : '0'
      try {
        await git.stash(['drop', `stash@{${index}}`])
        console.log(chalk.green(`✓ Dropped stash@{${index}}`))
      } catch (err) {
        console.error(chalk.red(`Failed to drop stash: ${err instanceof Error ? err.message : 'Unknown error'}`))
        process.exit(1)
      }
      return
    }

    // Clear all stashes
    if (options.clear) {
      const readline = await import('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.yellow('Clear all stashes? This cannot be undone. (y/N) '), resolve)
      })
      rl.close()

      if (answer.toLowerCase() === 'y') {
        await git.stash(['clear'])
        console.log(chalk.green('✓ Cleared all stashes'))
      } else {
        console.log(chalk.gray('Cancelled'))
      }
      return
    }

    // Create new stash
    const status = await git.status()
    if (status.isClean()) {
      console.log(chalk.yellow('No changes to stash'))
      return
    }

    let stashName: string

    if (name) {
      // Use provided name
      stashName = name
    } else {
      // Generate name with AI
      const provider = await resolveProvider(options.provider)
      const diff = await git.diff()
      const stagedDiff = await git.diff(['--cached'])
      const fullDiff = diff + '\n' + stagedDiff

      if (!fullDiff.trim()) {
        // Only untracked files
        stashName = `WIP: untracked files (${status.not_added.length} files)`
      } else {
        const spinner = ora('Generating stash name...').start()
        try {
          const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())
          const template = findTemplate(repoRoot.trim(), 'stash')
          stashName = await generateStashName(fullDiff, { provider, model: options.model }, template || undefined)
          spinner.stop()
        } catch {
          spinner.fail('Failed to generate name, using default')
          stashName = `WIP: ${status.modified.length} modified, ${status.not_added.length} untracked`
        }
      }
    }

    // Include untracked files
    await git.stash(['push', '-u', '-m', stashName])
    console.log(chalk.green(`✓ Stashed: ${stashName}`))
  })
