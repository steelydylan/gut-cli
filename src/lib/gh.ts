import { execSync } from 'child_process'
import chalk from 'chalk'

let ghInstalledCache: boolean | null = null

export function isGhCliInstalled(): boolean {
  if (ghInstalledCache !== null) {
    return ghInstalledCache
  }
  try {
    execSync('gh --version', { stdio: 'pipe' })
    ghInstalledCache = true
    return true
  } catch {
    ghInstalledCache = false
    return false
  }
}

export function printGhNotInstalledMessage(): void {
  console.log(chalk.yellow('\n⚠ GitHub CLI (gh) is not installed'))
  console.log(chalk.gray('  This command requires gh CLI. Install it:'))
  console.log(chalk.gray('    brew install gh  (macOS)'))
  console.log(chalk.gray('    https://cli.github.com/'))
}

export function requireGhCli(): boolean {
  if (!isGhCliInstalled()) {
    printGhNotInstalledMessage()
    return false
  }
  return true
}
