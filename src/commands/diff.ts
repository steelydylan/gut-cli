import { Command } from 'commander'
import chalk from 'chalk'
import { simpleGit } from 'simple-git'

interface FileDiff {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  hunks: Hunk[]
}

interface Hunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: HunkLine[]
}

interface HunkLine {
  type: 'context' | 'addition' | 'deletion'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

function parseDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = []
  const fileBlocks = diffText.split(/^diff --git /m).filter(Boolean)

  for (const block of fileBlocks) {
    const lines = block.split('\n')
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue

    const oldFile = headerMatch[1]
    const newFile = headerMatch[2]

    let status: FileDiff['status'] = 'modified'
    if (block.includes('new file mode')) {
      status = 'added'
    } else if (block.includes('deleted file mode')) {
      status = 'deleted'
    } else if (oldFile !== newFile) {
      status = 'renamed'
    }

    const hunks: Hunk[] = []
    let additions = 0
    let deletions = 0

    // Parse hunks
    const hunkMatches = block.matchAll(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/g)

    for (const match of hunkMatches) {
      const hunkStart = block.indexOf(match[0])
      const hunkEnd = block.indexOf('\n@@', hunkStart + 1)
      const hunkText =
        hunkEnd === -1 ? block.slice(hunkStart) : block.slice(hunkStart, hunkEnd)

      const hunkLines = hunkText.split('\n').slice(1)
      const parsedLines: HunkLine[] = []

      let oldLine = parseInt(match[1]) || 1
      let newLine = parseInt(match[3]) || 1

      for (const line of hunkLines) {
        if (line.startsWith('+')) {
          parsedLines.push({
            type: 'addition',
            content: line.slice(1),
            newLineNumber: newLine++
          })
          additions++
        } else if (line.startsWith('-')) {
          parsedLines.push({
            type: 'deletion',
            content: line.slice(1),
            oldLineNumber: oldLine++
          })
          deletions++
        } else if (line.startsWith(' ') || line === '') {
          parsedLines.push({
            type: 'context',
            content: line.slice(1) || '',
            oldLineNumber: oldLine++,
            newLineNumber: newLine++
          })
        }
      }

      hunks.push({
        oldStart: parseInt(match[1]) || 1,
        oldLines: parseInt(match[2]) || 1,
        newStart: parseInt(match[3]) || 1,
        newLines: parseInt(match[4]) || 1,
        lines: parsedLines
      })
    }

    files.push({
      file: newFile,
      status,
      additions,
      deletions,
      hunks
    })
  }

  return files
}

export const diffCommand = new Command('diff')
  .description('Show changes with optional JSON output')
  .argument('[file]', 'Specific file to diff')
  .option('-s, --staged', 'Show staged changes')
  .option('-c, --commit <hash>', 'Show changes in a specific commit')
  .option('--json', 'Output as JSON')
  .option('--stat', 'Show diffstat only')
  .action(async (file, options) => {
    const git = simpleGit()

    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.error(chalk.red('Error: Not a git repository'))
      process.exit(1)
    }

    try {
      const args: string[] = []

      if (options.commit) {
        args.push(`${options.commit}^`, options.commit)
      } else if (options.staged) {
        args.push('--cached')
      }

      if (file) {
        args.push('--', file)
      }

      const diffText = await git.diff(args)

      if (!diffText.trim()) {
        if (options.json) {
          console.log(JSON.stringify({ files: [] }, null, 2))
        } else {
          console.log(chalk.gray('No changes'))
        }
        return
      }

      const parsed = parseDiff(diffText)

      if (options.json) {
        console.log(JSON.stringify({ files: parsed }, null, 2))
        return
      }

      if (options.stat) {
        // Show stat view
        let totalAdditions = 0
        let totalDeletions = 0

        for (const file of parsed) {
          totalAdditions += file.additions
          totalDeletions += file.deletions

          const total = file.additions + file.deletions
          const maxBar = 40
          const addBar = Math.round((file.additions / Math.max(total, 1)) * Math.min(total, maxBar))
          const delBar = Math.round((file.deletions / Math.max(total, 1)) * Math.min(total, maxBar))

          const statusIcon =
            file.status === 'added'
              ? chalk.green('+')
              : file.status === 'deleted'
                ? chalk.red('-')
                : chalk.yellow('~')

          console.log(
            ` ${statusIcon} ${file.file.padEnd(50)} | ${String(total).padStart(4)} ${chalk.green('+'.repeat(addBar))}${chalk.red('-'.repeat(delBar))}`
          )
        }

        console.log(chalk.gray('─'.repeat(70)))
        console.log(
          ` ${parsed.length} file(s) changed, ${chalk.green(`${totalAdditions} insertions(+)`)}, ${chalk.red(`${totalDeletions} deletions(-)`)}`
        )
        return
      }

      // Default: show full diff with colors
      for (const file of parsed) {
        console.log(chalk.bold.white(`\n${file.file}`))
        console.log(chalk.gray('─'.repeat(60)))

        for (const hunk of file.hunks) {
          console.log(
            chalk.cyan(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
          )

          for (const line of hunk.lines) {
            if (line.type === 'addition') {
              console.log(chalk.green(`+${line.content}`))
            } else if (line.type === 'deletion') {
              console.log(chalk.red(`-${line.content}`))
            } else {
              console.log(chalk.gray(` ${line.content}`))
            }
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Failed to get diff'))
      console.error(chalk.gray(error instanceof Error ? error.message : 'Unknown error'))
      process.exit(1)
    }
  })
