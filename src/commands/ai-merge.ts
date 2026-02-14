import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { resolveConflict } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'
import * as fs from 'fs'
import * as path from 'path'

export const aiMergeCommand = new Command('ai-merge')
  .description('Merge a branch with AI-powered conflict resolution')
  .argument('<branch>', 'Branch to merge')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('--no-commit', 'Do not auto-commit after resolving')
  .action(async (branch, options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = options.provider.toLowerCase() as Provider

    // Check for uncommitted changes
    const status = await git.status()
    if (status.modified.length > 0 || status.staged.length > 0) {
      console.error(chalk.red('Error: Working directory has uncommitted changes'))
      console.log(chalk.gray('Please commit or stash your changes first'))
      process.exit(1)
    }

    const branchInfo = await git.branch()
    const currentBranch = branchInfo.current

    console.log(chalk.bold(`\nMerging ${chalk.cyan(branch)} into ${chalk.cyan(currentBranch)}...\n`))

    // Attempt merge
    try {
      await git.merge([branch])
      console.log(chalk.green('✓ Merged successfully (no conflicts)'))
      return
    } catch (error) {
      // Merge failed, likely due to conflicts
    }

    // Get conflicted files
    const conflictStatus = await git.status()
    const conflictedFiles = conflictStatus.conflicted

    if (conflictedFiles.length === 0) {
      console.error(chalk.red('Merge failed for unknown reason'))
      await git.merge(['--abort'])
      process.exit(1)
    }

    console.log(chalk.yellow(`⚠ ${conflictedFiles.length} conflict(s) detected\n`))

    const spinner = ora()
    const rootDir = await git.revparse(['--show-toplevel'])

    for (const file of conflictedFiles) {
      const filePath = path.join(rootDir.trim(), file)
      const content = fs.readFileSync(filePath, 'utf-8')

      console.log(chalk.bold(`\n📄 ${file}`))

      // Show conflict preview
      const conflictMatch = content.match(/<<<<<<< HEAD[\s\S]*?>>>>>>>.+/g)
      if (conflictMatch) {
        console.log(chalk.gray('─'.repeat(50)))
        console.log(chalk.gray(conflictMatch[0].slice(0, 500)))
        if (conflictMatch[0].length > 500) console.log(chalk.gray('...'))
        console.log(chalk.gray('─'.repeat(50)))
      }

      spinner.start('AI is analyzing conflict...')

      try {
        const resolution = await resolveConflict(content, {
          filename: file,
          oursRef: currentBranch,
          theirsRef: branch
        }, { provider, model: options.model })

        spinner.stop()

        console.log(chalk.cyan('\n🤖 AI suggests:'))
        console.log(chalk.gray('─'.repeat(50)))
        const preview = resolution.resolvedContent.slice(0, 800)
        console.log(preview)
        if (resolution.resolvedContent.length > 800) console.log(chalk.gray('...'))
        console.log(chalk.gray('─'.repeat(50)))
        console.log(chalk.gray(`Strategy: ${resolution.strategy}`))
        console.log(chalk.gray(`Reason: ${resolution.explanation}`))

        // Ask for confirmation
        const readline = await import('readline')
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('\nAccept this resolution? (y/n/s to skip) '), resolve)
        })
        rl.close()

        if (answer.toLowerCase() === 'y') {
          fs.writeFileSync(filePath, resolution.resolvedContent)
          await git.add(file)
          console.log(chalk.green(`✓ Resolved ${file}`))
        } else if (answer.toLowerCase() === 's') {
          console.log(chalk.yellow(`⏭ Skipped ${file}`))
        } else {
          console.log(chalk.yellow(`✗ Rejected - resolve manually: ${file}`))
        }
      } catch (error) {
        spinner.fail('AI resolution failed')
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
        console.log(chalk.yellow(`Please resolve manually: ${file}`))
      }
    }

    // Check remaining conflicts
    const finalStatus = await git.status()
    if (finalStatus.conflicted.length > 0) {
      console.log(chalk.yellow(`\n⚠ ${finalStatus.conflicted.length} conflict(s) remaining`))
      console.log(chalk.gray('Resolve manually and run: git add <files> && git commit'))
    } else if (options.commit !== false) {
      await git.commit(`Merge branch '${branch}' into ${currentBranch}`)
      console.log(chalk.green('\n✓ All conflicts resolved and committed'))
    } else {
      console.log(chalk.green('\n✓ All conflicts resolved'))
      console.log(chalk.gray('Run: git commit'))
    }
  })
