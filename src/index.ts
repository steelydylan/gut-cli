import { Command } from 'commander'
import { cleanupCommand } from './commands/cleanup.js'
import { conflictCommand } from './commands/conflict.js'
import { authCommand } from './commands/auth.js'
import { aiCommitCommand } from './commands/ai-commit.js'
import { aiPrCommand } from './commands/ai-pr.js'
import { aiReviewCommand } from './commands/ai-review.js'
import { diffCommand } from './commands/diff.js'
import { blameCommand } from './commands/blame.js'

const program = new Command()

program
  .name('gut')
  .description('Git Utility Tool - A collection of handy git commands')
  .version('0.1.0')

// Branch management
program.addCommand(cleanupCommand)
program.addCommand(conflictCommand)

// Authentication
program.addCommand(authCommand)

// AI-powered commands
program.addCommand(aiCommitCommand)
program.addCommand(aiPrCommand)
program.addCommand(aiReviewCommand)

// Enhanced git commands
program.addCommand(diffCommand)
program.addCommand(blameCommand)

program.parse()
