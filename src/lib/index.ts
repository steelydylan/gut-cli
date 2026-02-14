// Library exports for gut-cli
// These can be imported by other packages like gitton

export {
  generateCommitMessage,
  generatePRDescription,
  generateCodeReview,
  generateChangelog,
  generateExplanation,
  searchCommits,
  generateBranchName,
  generateBranchNameFromDiff,
  generateStashName,
  generateWorkSummary,
  resolveConflict,
  generateGitignore,
  findTemplate,
  type AIOptions,
  type CodeReview,
  type Changelog,
  type Explanation,
  type CommitSearchResult,
  type WorkSummary,
  type ConflictResolution
} from './ai.js'

export { getApiKey, saveApiKey, deleteApiKey, listProviders, type Provider } from './credentials.js'

export { getLanguage, setLanguage, getLanguageInstruction } from './config.js'
