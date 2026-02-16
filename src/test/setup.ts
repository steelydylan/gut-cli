import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type SimpleGit, simpleGit } from 'simple-git'

export interface TestGitRepo {
  dir: string
  git: SimpleGit
  cleanup: () => void
  writeFile: (name: string, content: string) => string
}

/**
 * Create a temporary git repository for testing
 */
export async function createTestRepo(prefix: string = 'gut-test'): Promise<TestGitRepo> {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })

  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.email', 'test@example.com')
  await git.addConfig('user.name', 'Test User')

  // Create initial commit so we have a valid repo
  const readmePath = join(dir, 'README.md')
  writeFileSync(readmePath, '# Test Project\n')
  await git.add('README.md')
  await git.commit('Initial commit')

  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }

  const writeFile = (name: string, content: string): string => {
    const filePath = join(dir, name)
    // Create parent directories if needed
    const parentDir = join(dir, ...name.split('/').slice(0, -1))
    if (parentDir !== dir) {
      mkdirSync(parentDir, { recursive: true })
    }
    writeFileSync(filePath, content)
    return filePath
  }

  return { dir, git, cleanup, writeFile }
}

/**
 * Create multiple test files at once
 */
export function createTestFiles(repo: TestGitRepo, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    repo.writeFile(name, content)
  }
}

/**
 * Standard AI module mocks
 */
export const aiMocks = {
  generateCommitMessage: () => Promise.resolve('feat(test): add new feature'),
  generateBranchName: () => Promise.resolve('feature/test-branch'),
  generateBranchNameFromDiff: () => Promise.resolve('feature/from-diff'),
  generateStashName: () => Promise.resolve('WIP: test changes'),
  generatePRDescription: () => Promise.resolve({ title: 'Test PR', body: 'Test body' }),
  generateCodeReview: () =>
    Promise.resolve({
      summary: 'Good code',
      issues: [],
      positives: ['Clean code']
    }),
  findTemplate: () => null
}

/**
 * Standard credentials mocks
 */
export const credentialsMocks = {
  resolveProvider: () => Promise.resolve('gemini' as const),
  getApiKey: () => 'test-api-key',
  getFirstAvailableProvider: () => Promise.resolve('gemini' as const)
}
