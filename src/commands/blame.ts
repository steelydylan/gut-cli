import { Command } from 'commander'
import chalk from 'chalk'
import { simpleGit } from 'simple-git'

interface BlameLine {
  commit: string
  author: string
  date: string
  lineNumber: number
  content: string
}

interface BlameResult {
  file: string
  lines: BlameLine[]
  authors: { name: string; lines: number; percentage: number }[]
}

async function parseBlame(git: ReturnType<typeof simpleGit>, file: string): Promise<BlameResult> {
  const result = await git.raw(['blame', '--porcelain', file])
  const lines: BlameLine[] = []
  const authorCounts = new Map<string, number>()

  const chunks = result.split(/^([a-f0-9]{40})/m).filter(Boolean)

  let lineNumber = 1
  for (let i = 0; i < chunks.length; i += 2) {
    const commit = chunks[i]
    const info = chunks[i + 1]
    if (!info) continue

    const authorMatch = info.match(/^author (.+)$/m)
    const dateMatch = info.match(/^author-time (\d+)$/m)
    const contentMatch = info.match(/^\t(.*)$/m)

    if (authorMatch && contentMatch) {
      const author = authorMatch[1]
      const timestamp = dateMatch ? parseInt(dateMatch[1]) * 1000 : Date.now()

      lines.push({
        commit: commit.slice(0, 7),
        author,
        date: new Date(timestamp).toISOString().split('T')[0],
        lineNumber: lineNumber++,
        content: contentMatch[1]
      })

      authorCounts.set(author, (authorCounts.get(author) || 0) + 1)
    }
  }

  const totalLines = lines.length
  const authors = Array.from(authorCounts.entries())
    .map(([name, count]) => ({
      name,
      lines: count,
      percentage: Math.round((count / totalLines) * 100)
    }))
    .sort((a, b) => b.lines - a.lines)

  return {
    file,
    lines,
    authors
  }
}

export const blameCommand = new Command('blame')
  .description('Show file blame with optional JSON output')
  .argument('<file>', 'File to blame')
  .option('--json', 'Output as JSON')
  .option('--authors', 'Show author summary only')
  .option('-L, --lines <range>', 'Line range (e.g., 10,20 or 10,+5)')
  .action(async (file, options) => {
    const git = simpleGit()

    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    try {
      const blame = await parseBlame(git, file)

      // Filter by line range if specified
      if (options.lines) {
        const [start, endOrOffset] = options.lines.split(',')
        const startLine = parseInt(start)
        let endLine: number

        if (endOrOffset.startsWith('+')) {
          endLine = startLine + parseInt(endOrOffset.slice(1))
        } else {
          endLine = parseInt(endOrOffset)
        }

        blame.lines = blame.lines.filter(
          (l) => l.lineNumber >= startLine && l.lineNumber <= endLine
        )
      }

      if (options.json) {
        console.log(JSON.stringify(blame, null, 2))
        return
      }

      if (options.authors) {
        console.log(chalk.bold(`\nAuthors of ${file}:\n`))
        for (const author of blame.authors) {
          const bar = '█'.repeat(Math.max(1, Math.round(author.percentage / 5)))
          console.log(
            `  ${author.name.padEnd(30)} ${String(author.lines).padStart(5)} lines (${String(author.percentage).padStart(2)}%) ${chalk.green(bar)}`
          )
        }
        console.log()
        return
      }

      // Default: show blame
      console.log(chalk.bold(`\n${file}\n`))

      const maxAuthorLen = Math.min(
        15,
        Math.max(...blame.lines.map((l) => l.author.length))
      )

      for (const line of blame.lines) {
        const lineNum = String(line.lineNumber).padStart(4)
        const commit = chalk.yellow(line.commit)
        const author = line.author.slice(0, maxAuthorLen).padEnd(maxAuthorLen)
        const date = chalk.gray(line.date)

        console.log(
          `${chalk.gray(lineNum)} ${commit} ${chalk.cyan(author)} ${date}  ${line.content}`
        )
      }
    } catch (error) {
      console.error(chalk.red('Failed to get blame'))
      console.error(chalk.gray(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
