import { Option } from 'commander'
import { PROVIDERS } from './credentials.js'

export const BRANCH_TYPES = ['feature', 'fix', 'hotfix', 'chore', 'refactor'] as const

/**
 * Create a provider option with choices
 */
export function providerOption(): Option {
  return new Option('-p, --provider <provider>', 'AI provider').choices([...PROVIDERS])
}

/**
 * Create a branch type option with choices
 */
export function branchTypeOption(): Option {
  return new Option('-t, --type <type>', 'Branch type').choices([...BRANCH_TYPES])
}
