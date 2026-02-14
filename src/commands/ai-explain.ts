import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { simpleGit } from 'simple-git'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { generateExplanation } from '../lib/ai.js'
import { Provider } from '../lib/credentials.js'

const CONTEXT_PATHS = [
  '.gut/explain.md'
]

function findExplainContext(repoRoot: string): string | null {
  for (const contextPath of CONTEXT_PATHS) {
    const fullPath = join(repoRoot, contextPath)
    if (existsSync(fullPath)) {
      return readFileSync(fullPath, 'utf-8')
    }
  }
  return null
}

export const aiExplainCommand = new Command('ai-explain')
  .alias('explain')
  .description('Get an AI-powered explanation of a commit, PR, or file changes')
  .argument('[target]', 'Commit hash, PR number, PR URL, or file path')
  .option('-p, --provider <provider>', 'AI provider (gemini, openai, anthropic)', 'gemini')
  .option('-m, --model <model>', 'Model to use (provider-specific)')
  .option('-n, --commits <n>', 'Number of commits to analyze for file history (default: 1)', '1')
  .option('--history', 'Explain file change history instead of content')
  .option('--json', 'Output as JSON')
  .action(async (target, options) => {
    const git = simpleGit()

    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    const provider = options.provider.toLowerCase() as Provider
    const repoRoot = await git.revparse(['--show-toplevel']).catch(() => process.cwd())
    const spinner = ora('Analyzing...').start()

    try {
      let context: ExplainContext

      if (!target) {
        // Default to HEAD
        target = 'HEAD'
      }

      // Detect target type: PR, file, or commit
      const isPR = target.match(/^#?\d+$/) || target.includes('/pull/')
      const isFile = existsSync(target)

      if (isPR) {
        context = await getPRContext(target, spinner)
      } else if (isFile) {
        if (options.history) {
          context = await getFileHistoryContext(target, git, spinner, parseInt(options.commits, 10))
        } else {
          context = await getFileContentContext(target, spinner)
        }
      } else {
        context = await getCommitContext(target, git, spinner)
      }

      // Find project context
      const projectContext = findExplainContext(repoRoot.trim())
      if (projectContext) {
        console.log(chalk.gray('Using project context...'))
      }

      spinner.text = 'AI is generating explanation...'

      const explanation = await generateExplanation(context, {
        provider,
        model: options.model
      }, projectContext || undefined)

      spinner.stop()

      if (options.json) {
        console.log(JSON.stringify(explanation, null, 2))
        return
      }

      printExplanation(explanation, context.type)
    } catch (error) {
      spinner.fail('Failed to generate explanation')
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })

interface ExplainContext {
  type: 'commit' | 'pr' | 'file-history' | 'file-content'
  title: string
  diff?: string
  content?: string
  metadata: {
    hash?: string
    author?: string
    date?: string
    prNumber?: string
    prUrl?: string
    baseBranch?: string
    headBranch?: string
    commits?: string[]
    filePath?: string
  }
}

async function getCommitContext(
  hash: string,
  git: ReturnType<typeof simpleGit>,
  spinner: ReturnType<typeof ora>
): Promise<ExplainContext> {
  spinner.text = `Analyzing commit ${hash.slice(0, 7)}...`

  // Get commit info
  const log = await git.log({ from: `${hash}^`, to: hash, maxCount: 1 })
  const commit = log.latest

  if (!commit) {
    throw new Error(`Commit not found: ${hash}`)
  }

  // Get diff
  const diff = await git.diff([`${hash}^`, hash])

  return {
    type: 'commit',
    title: commit.message.split('\n')[0],
    diff,
    metadata: {
      hash: commit.hash,
      author: commit.author_name,
      date: commit.date
    }
  }
}

async function getFileContentContext(
  filePath: string,
  spinner: ReturnType<typeof ora>
): Promise<ExplainContext> {
  spinner.text = `Reading ${filePath}...`

  const content = readFileSync(filePath, 'utf-8')

  return {
    type: 'file-content',
    title: filePath,
    content,
    metadata: {
      filePath
    }
  }
}

async function getFileHistoryContext(
  filePath: string,
  git: ReturnType<typeof simpleGit>,
  spinner: ReturnType<typeof ora>,
  numCommits: number
): Promise<ExplainContext> {
  spinner.text = `Analyzing recent changes to ${filePath}...`

  // Get recent commits for this file
  const log = await git.log({ file: filePath, maxCount: numCommits })
  const commits = log.all

  if (commits.length === 0) {
    throw new Error(`No commits found for file: ${filePath}`)
  }

  // Get combined diff for all commits
  let diff: string
  if (numCommits === 1) {
    const hash = commits[0].hash
    diff = await git.diff([`${hash}^`, hash, '--', filePath])
  } else {
    // Get diff from oldest to newest commit
    const oldestHash = commits[commits.length - 1].hash
    const newestHash = commits[0].hash
    diff = await git.diff([`${oldestHash}^`, newestHash, '--', filePath])
  }

  const commitMessages = commits.map((c) => c.message.split('\n')[0])

  return {
    type: 'file-history',
    title: numCommits === 1 ? commitMessages[0] : `${numCommits} recent changes to ${filePath}`,
    diff,
    metadata: {
      filePath,
      hash: commits[0].hash,
      author: commits[0].author_name,
      date: commits[0].date,
      commits: commitMessages
    }
  }
}

async function getPRContext(
  target: string,
  spinner: ReturnType<typeof ora>
): Promise<ExplainContext> {
  // Extract PR number
  let prNumber: string
  if (target.includes('/pull/')) {
    const match = target.match(/\/pull\/(\d+)/)
    prNumber = match ? match[1] : target
  } else {
    prNumber = target.replace(/^#/, '')
  }

  spinner.text = `Fetching PR #${prNumber}...`

  // Get PR info using gh CLI
  let prInfo: {
    title: string
    url: string
    baseRefName: string
    headRefName: string
    commits: { nodes: Array<{ commit: { message: string } }> }
  }

  try {
    const prJson = execSync(
      `gh pr view ${prNumber} --json title,url,baseRefName,headRefName,commits`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    prInfo = JSON.parse(prJson)
  } catch {
    throw new Error(`Failed to fetch PR #${prNumber}. Make sure gh CLI is installed and authenticated.`)
  }

  spinner.text = `Getting diff for PR #${prNumber}...`

  // Get PR diff
  let diff: string
  try {
    diff = execSync(`gh pr diff ${prNumber}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    })
  } catch {
    throw new Error(`Failed to get diff for PR #${prNumber}`)
  }

  const commits = prInfo.commits.nodes.map((n) => n.commit.message.split('\n')[0])

  return {
    type: 'pr',
    title: prInfo.title,
    diff,
    metadata: {
      prNumber,
      prUrl: prInfo.url,
      baseBranch: prInfo.baseRefName,
      headBranch: prInfo.headRefName,
      commits
    }
  }
}

interface Explanation {
  summary: string
  purpose: string
  changes: Array<{ file: string; description: string }>
  impact: string
  notes?: string[]
}

function printExplanation(explanation: Explanation, type: 'commit' | 'pr' | 'file-history' | 'file-content') {
  const icons: Record<string, string> = {
    pr: '🔀',
    'file-content': '📄',
    'file-history': '📜',
    commit: '📝'
  }
  const icon = icons[type] || '📝'
  console.log(chalk.bold(`\n${icon} Explanation\n`))

  // Summary
  console.log(chalk.cyan('Summary:'))
  console.log(`  ${explanation.summary}\n`)

  // Purpose
  console.log(chalk.cyan('Purpose:'))
  console.log(`  ${explanation.purpose}\n`)

  // Changes / Components
  if (explanation.changes.length > 0) {
    const header = type === 'file-content' ? 'Components:' : 'Key Changes:'
    console.log(chalk.cyan(header))
    for (const change of explanation.changes) {
      console.log(`  ${chalk.yellow(change.file)}`)
      console.log(`    ${chalk.gray(change.description)}`)
    }
    console.log()
  }

  // Impact
  console.log(chalk.cyan('Impact:'))
  console.log(`  ${explanation.impact}\n`)

  // Notes
  if (explanation.notes && explanation.notes.length > 0) {
    console.log(chalk.cyan('Notes:'))
    for (const note of explanation.notes) {
      console.log(`  ${chalk.gray('•')} ${note}`)
    }
    console.log()
  }
}
