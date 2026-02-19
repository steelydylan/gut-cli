import { execSync } from 'node:child_process'
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

export function getDefaultBranch(): string | null {
  if (!isGhCliInstalled()) {
    return null
  }
  try {
    const result = execSync('gh repo view --json defaultBranchRef --jq ".defaultBranchRef.name"', {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const branch = result.toString().trim()
    return branch || null
  } catch {
    return null
  }
}

export function getExistingPrUrl(): string | null {
  if (!isGhCliInstalled()) {
    return null
  }
  try {
    const result = execSync('gh pr view --json url --jq ".url"', {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const url = result.toString().trim()
    return url || null
  } catch {
    return null
  }
}

export function hasUpstreamBranch(): boolean {
  try {
    execSync('git rev-parse --abbrev-ref @{upstream}', {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return true
  } catch {
    return false
  }
}

export function pushBranchToOrigin(branch: string): void {
  execSync(`git push -u origin ${branch}`, {
    stdio: ['pipe', 'pipe', 'pipe']
  })
}
