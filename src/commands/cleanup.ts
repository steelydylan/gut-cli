import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'

export const cleanupCommand = new Command('cleanup')
  .description('Delete merged branches safely')
  .option('-r, --remote', 'Also delete remote branches')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--dry-run', 'Show branches that would be deleted without deleting')
  .option('--base <branch>', 'Base branch to compare against (default: main or master)')
  .action(async (options) => {
    const git = simpleGit()

    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const spinner = ora('Fetching branch information...').start()

    try {
      // Fetch latest from remote
      await git.fetch(['--prune'])

      // Get current branch
      const currentBranch = (await git.branch()).current

      // Determine base branch
      const baseBranch = options.base || (await detectBaseBranch(git))
      spinner.text = `Using ${chalk.cyan(baseBranch)} as base branch`

      // Get merged branches
      const mergedResult = await git.branch(['--merged', baseBranch])
      const mergedBranches = mergedResult.all.filter((branch) => {
        const cleanName = branch.trim().replace(/^\* /, '')
        // Exclude current branch, base branch, and remote tracking branches
        return (
          cleanName !== currentBranch &&
          cleanName !== baseBranch &&
          !cleanName.startsWith('remotes/') &&
          cleanName !== 'main' &&
          cleanName !== 'master' &&
          cleanName !== 'develop'
        )
      })

      spinner.stop()

      if (mergedBranches.length === 0) {
        console.log(chalk.green('✓ No merged branches to clean up'))
        return
      }

      console.log(chalk.yellow(`\nFound ${mergedBranches.length} merged branch(es):\n`))
      mergedBranches.forEach((branch) => {
        console.log(`  ${chalk.red('•')} ${branch}`)
      })

      if (options.dryRun) {
        console.log(chalk.blue('\n(dry-run mode - no branches were deleted)'))
        return
      }

      if (!options.force) {
        const readline = await import('readline')
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.yellow('\nDelete these branches? (y/N) '), resolve)
        })
        rl.close()

        if (answer.toLowerCase() !== 'y') {
          console.log(chalk.gray('Cancelled'))
          return
        }
      }

      // Delete branches
      const deleteSpinner = ora('Deleting branches...').start()

      for (const branch of mergedBranches) {
        try {
          await git.deleteLocalBranch(branch, true)
          deleteSpinner.text = `Deleted ${branch}`

          if (options.remote) {
            try {
              await git.push('origin', `:${branch}`)
            } catch {
              // Remote branch might not exist, ignore
            }
          }
        } catch {
          deleteSpinner.warn(`Failed to delete ${branch}`)
        }
      }

      deleteSpinner.succeed(chalk.green(`Deleted ${mergedBranches.length} branch(es)`))
    } catch (err) {
      spinner.fail('Failed to cleanup branches')
      console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'))
      process.exit(1)
    }
  })

async function detectBaseBranch(git: ReturnType<typeof simpleGit>): Promise<string> {
  const branches = await git.branch()
  if (branches.all.includes('main')) return 'main'
  if (branches.all.includes('master')) return 'master'
  return 'main'
}
