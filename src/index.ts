import { createRequire } from 'node:module'
import { Command } from 'commander'
import { authCommand } from './commands/auth.js'
import { handleCompletion, installCompletion, uninstallCompletion } from './commands/completion.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

import { branchCommand } from './commands/branch.js'
import { changelogCommand } from './commands/changelog.js'
import { checkoutCommand } from './commands/checkout.js'
import { cleanupCommand } from './commands/cleanup.js'
import { commitCommand } from './commands/commit.js'
import { configCommand } from './commands/config.js'
import { explainCommand } from './commands/explain.js'
import { findCommand } from './commands/find.js'
import { gitignoreCommand } from './commands/gitignore.js'
import { initCommand } from './commands/init.js'
import { langCommand } from './commands/lang.js'
import { mergeCommand } from './commands/merge.js'
import { prCommand } from './commands/pr.js'
import { reviewCommand } from './commands/review.js'
import { stashCommand } from './commands/stash.js'
import { summaryCommand } from './commands/summary.js'
import { syncCommand } from './commands/sync.js'

const program = new Command()

program
  .name('gut')
  .description('Git Utility Tool - AI-powered git commands')
  .version(pkg.version, '-v, --version')

// Branch management
program.addCommand(cleanupCommand)

// Authentication
program.addCommand(authCommand)

// AI-powered commands
program.addCommand(commitCommand)
program.addCommand(prCommand)
program.addCommand(reviewCommand)
program.addCommand(mergeCommand)
program.addCommand(changelogCommand)
program.addCommand(explainCommand)
program.addCommand(findCommand)
program.addCommand(branchCommand)
program.addCommand(checkoutCommand)
program.addCommand(syncCommand)
program.addCommand(stashCommand)
program.addCommand(summaryCommand)

// Configuration
program.addCommand(configCommand)
program.addCommand(langCommand)
program.addCommand(initCommand)
program.addCommand(gitignoreCommand)

// Shell completion command
const completionCommand = new Command('completion').description('Manage shell completion')

completionCommand
  .command('install')
  .description('Install shell completion (auto-detects your shell)')
  .action(async () => {
    await installCompletion()
  })

completionCommand
  .command('uninstall')
  .description('Uninstall shell completion')
  .action(async () => {
    await uninstallCompletion()
  })

program.addCommand(completionCommand)

// Handle tab completion before parsing
async function main() {
  // Check if we're in completion mode (tabtab sets COMP_LINE env var)
  const isCompletionMode = await handleCompletion(program)
  if (isCompletionMode) {
    return
  }

  program.parse()
}

main()
