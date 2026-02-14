import { Command } from 'commander'
import { cleanupCommand } from './commands/cleanup.js'
import { authCommand } from './commands/auth.js'
import { aiCommitCommand } from './commands/ai-commit.js'
import { aiPrCommand } from './commands/ai-pr.js'
import { aiReviewCommand } from './commands/ai-review.js'
import { aiMergeCommand } from './commands/ai-merge.js'
import { changelogCommand } from './commands/changelog.js'
import { aiExplainCommand } from './commands/ai-explain.js'
import { aiFindCommand } from './commands/ai-find.js'
import { aiBranchCommand } from './commands/ai-branch.js'
import { syncCommand } from './commands/sync.js'
import { stashCommand } from './commands/stash.js'
import { summaryCommand } from './commands/summary.js'
import { configCommand } from './commands/config.js'
import { langCommand } from './commands/lang.js'

const program = new Command()

program
  .name('gut')
  .description('Git Utility Tool - AI-powered git commands')
  .version('0.1.0')

// Branch management
program.addCommand(cleanupCommand)

// Authentication
program.addCommand(authCommand)

// AI-powered commands
program.addCommand(aiCommitCommand)
program.addCommand(aiPrCommand)
program.addCommand(aiReviewCommand)
program.addCommand(aiMergeCommand)
program.addCommand(changelogCommand)
program.addCommand(aiExplainCommand)
program.addCommand(aiFindCommand)
program.addCommand(aiBranchCommand)
program.addCommand(syncCommand)
program.addCommand(stashCommand)
program.addCommand(summaryCommand)

// Configuration
program.addCommand(configCommand)
program.addCommand(langCommand)

program.parse()
