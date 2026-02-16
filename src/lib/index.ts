// Library exports for gut-cli
// These can be imported by other packages like gitton

export {
  type AIOptions,
  type Changelog,
  type CodeReview,
  type CommitSearchResult,
  type ConflictResolution,
  type Explanation,
  findTemplate,
  generateBranchName,
  generateBranchNameFromDiff,
  generateChangelog,
  generateCodeReview,
  generateCommitMessage,
  generateExplanation,
  generateGitignore,
  generatePRDescription,
  generateStashName,
  generateWorkSummary,
  type Language,
  resolveConflict,
  searchCommits,
  type WorkSummary
} from './ai.js'
export { getLanguage, getLanguageInstruction, setLanguage } from './config.js'
export { deleteApiKey, getApiKey, listProviders, type Provider, saveApiKey } from './credentials.js'
