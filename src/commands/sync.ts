import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'

export const syncCommand = new Command('sync')
  .description('Sync current branch with remote (fetch + rebase/merge)')
  .option('-m, --merge', 'Use merge instead of rebase')
  .option('--no-push', 'Skip push after syncing')
  .option('--stash', 'Auto-stash changes before sync')
  .option('-f, --force', 'Force sync even with uncommitted changes')
  .action(async (options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const spinner = ora('Checking repository status...').start()

    try {
      // Check for uncommitted changes
      const status = await git.status()
      const hasChanges = !status.isClean()

      if (hasChanges && !options.stash && !options.force) {
        spinner.stop()
        console.log(chalk.yellow('You have uncommitted changes:'))
        if (status.modified.length > 0) {
          console.log(chalk.gray(`  Modified: ${status.modified.length} file(s)`))
        }
        if (status.not_added.length > 0) {
          console.log(chalk.gray(`  Untracked: ${status.not_added.length} file(s)`))
        }
        console.log()
        console.log(chalk.gray('Use --stash to auto-stash, or --force to sync anyway'))
        process.exit(1)
      }

      // Stash if needed
      let stashed = false
      if (hasChanges && options.stash) {
        spinner.text = 'Stashing changes...'
        await git.stash(['push', '-m', `gut-sync: auto-stash before sync`])
        stashed = true
      }

      // Fetch from remote
      spinner.text = 'Fetching from remote...'
      await git.fetch(['--all', '--prune'])

      const currentBranch = status.current
      if (!currentBranch) {
        spinner.fail('Could not determine current branch')
        process.exit(1)
      }

      // Check if branch has upstream
      const trackingBranch = status.tracking

      if (!trackingBranch) {
        spinner.warn(`Branch ${currentBranch} has no upstream tracking branch`)
        console.log(chalk.gray(`\nTo set upstream: git push -u origin ${currentBranch}`))

        if (stashed) {
          await git.stash(['pop'])
          console.log(chalk.gray('Restored stashed changes'))
        }
        return
      }

      // Rebase or merge
      const strategy = options.merge ? 'merge' : 'rebase'
      spinner.text = `Syncing with ${trackingBranch} (${strategy})...`

      try {
        if (options.merge) {
          await git.merge([trackingBranch])
        } else {
          await git.rebase([trackingBranch])
        }
      } catch {
        spinner.fail(`${strategy} failed - you may have conflicts`)
        console.log(chalk.yellow('\nResolve conflicts and then:'))
        if (options.merge) {
          console.log(chalk.gray('  git add . && git commit'))
        } else {
          console.log(chalk.gray('  git add . && git rebase --continue'))
        }

        if (stashed) {
          console.log(chalk.yellow('\nNote: You have stashed changes. Run `git stash pop` after resolving.'))
        }
        process.exit(1)
      }

      // Check if we're ahead and can push
      const newStatus = await git.status()
      const ahead = newStatus.ahead || 0
      const behind = newStatus.behind || 0

      spinner.succeed(chalk.green('Synced successfully'))

      if (behind > 0) {
        console.log(chalk.yellow(`  ↓ ${behind} commit(s) behind`))
      }

      if (ahead > 0) {
        if (options.push !== false) {
          const pushSpinner = ora('Pushing to remote...').start()
          try {
            await git.push()
            pushSpinner.succeed(chalk.green(`Pushed ${ahead} commit(s)`))
          } catch (err) {
            pushSpinner.fail('Push failed')
            console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'))
          }
        } else {
          console.log(chalk.cyan(`  ↑ ${ahead} commit(s) ahead`))
        }
      }

      // Restore stash
      if (stashed) {
        spinner.start('Restoring stashed changes...')
        try {
          await git.stash(['pop'])
          spinner.succeed('Restored stashed changes')
        } catch {
          spinner.warn('Could not auto-restore stash (may have conflicts)')
          console.log(chalk.gray('  Run `git stash pop` manually'))
        }
      }

    } catch (err) {
      spinner.fail('Sync failed')
      console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'))
      process.exit(1)
    }
  })
