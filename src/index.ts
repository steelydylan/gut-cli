import { Command } from 'commander'
import { authCommand } from './commands/auth.js'
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

program.name('gut').description('Git Utility Tool - AI-powered git commands').version('0.1.0')

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

program.parse()
