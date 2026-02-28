import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Argument, Command, Option } from 'commander'
import { CONFIG_KEY_DESCRIPTIONS, LANGUAGE_DESCRIPTIONS } from '../lib/config.js'
import { PROVIDER_DESCRIPTIONS } from '../lib/credentials.js'

// Description lookup for argument choices
const CHOICE_DESCRIPTIONS: Record<string, Record<string, string>> = {
  language: LANGUAGE_DESCRIPTIONS,
  key: CONFIG_KEY_DESCRIPTIONS,
  provider: PROVIDER_DESCRIPTIONS
}

// Shell detection
function detectShell(): 'bash' | 'zsh' | 'fish' {
  const shell = process.env.SHELL || ''
  if (shell.includes('zsh')) return 'zsh'
  if (shell.includes('fish')) return 'fish'
  return 'bash'
}

// Shell config file locations
const SHELL_CONFIGS: Record<string, string> = {
  bash: join(homedir(), '.bashrc'),
  zsh: join(homedir(), '.zshrc'),
  fish: join(homedir(), '.config/fish/config.fish')
}

// Completion directory
const COMPLETION_DIR = join(homedir(), '.config/gut/completions')

// Completion script templates
const SCRIPT_TEMPLATES: Record<string, string> = {
  bash: `###-begin-gut-completion-###
_gut_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local words=("\${COMP_WORDS[@]}")
  COMPREPLY=($(COMP_CWORD="$COMP_CWORD" COMP_LINE="$COMP_LINE" COMP_POINT="$COMP_POINT" gut completion -- "\${words[@]}" 2>/dev/null | grep "^$cur"))
}
complete -F _gut_completion gut
###-end-gut-completion-###`,

  zsh: `###-begin-gut-completion-###
if type compdef &>/dev/null; then
  _gut_completion () {
    local reply
    local si=$IFS

    IFS=$'\\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" gut completion -- "\${words[@]}"))
    IFS=$si

    _describe 'values' reply
  }
  compdef _gut_completion gut
fi
###-end-gut-completion-###`,

  fish: `###-begin-gut-completion-###
function _gut_completion
  set -l cmd (commandline -opc)
  set -l cursor (commandline -C)
  set -l words (commandline -opc)

  set -l completions (COMP_CWORD=(count $words) COMP_LINE=(commandline) COMP_POINT=$cursor gut completion -- $words 2>/dev/null)

  for completion in $completions
    echo $completion
  end
end
complete -f -c gut -a '(_gut_completion)'
###-end-gut-completion-###`
}

// Parse completion environment
interface CompletionEnv {
  complete: boolean
  words: number
  point: number
  line: string
  partial: string
  last: string
  lastPartial: string
  prev: string
}

function parseEnv(): CompletionEnv {
  const cword = Number(process.env.COMP_CWORD) || 0
  const point = Number(process.env.COMP_POINT) || 0
  const line = process.env.COMP_LINE || ''

  const partial = line.slice(0, point)
  const parts = line.split(' ')
  const prev = parts.slice(0, -1).slice(-1)[0] || ''
  const last = parts.slice(-1).join('')
  const lastPartial = partial.split(' ').slice(-1).join('')

  const complete = !!(process.env.COMP_CWORD && process.env.COMP_POINT && process.env.COMP_LINE)

  return {
    complete,
    words: cword,
    point,
    line,
    partial,
    last,
    lastPartial,
    prev
  }
}

// Log completion items
function logCompletions(items: Array<string | { name: string; description?: string }>): void {
  const shell = detectShell()

  for (const item of items) {
    if (typeof item === 'string') {
      console.log(item)
    } else {
      const { name, description } = item
      if (shell === 'zsh' && description) {
        // Escape colons in name for zsh
        console.log(`${name.replace(/:/g, '\\:')}:${description}`)
      } else if (shell === 'fish' && description) {
        console.log(`${name}\t${description}`)
      } else {
        console.log(name)
      }
    }
  }
}

// Command extraction types
interface OptionInfo {
  name: string
  description: string
  choices?: string[]
}

interface ArgumentInfo {
  name: string
  description: string
  choices?: string[]
  required: boolean
}

interface SubcommandInfo {
  name: string
  description: string
  arguments?: ArgumentInfo[]
}

interface CommandInfo {
  description: string
  options: OptionInfo[]
  arguments?: ArgumentInfo[]
  subcommands?: SubcommandInfo[]
}

type CommandWithInternals = Command & {
  registeredArguments?: Array<Argument & { argChoices?: string[] }>
}

function extractArguments(cmd: CommandWithInternals): ArgumentInfo[] | undefined {
  const args = cmd.registeredArguments
  if (!args || args.length === 0) return undefined

  return args.map((arg) => ({
    name: arg.name(),
    description: arg.description,
    choices: arg.argChoices,
    required: arg.required
  }))
}

// Convert choices to items with descriptions
function choicesWithDescriptions(
  choices: string[],
  argName: string
): Array<{ name: string; description?: string }> {
  const descriptionMap = CHOICE_DESCRIPTIONS[argName]
  if (!descriptionMap) {
    return choices.map((name) => ({ name }))
  }
  return choices.map((name) => ({
    name,
    description: descriptionMap[name]
  }))
}

function extractCommands(program: Command): Map<string, CommandInfo> {
  const commands = new Map<string, CommandInfo>()

  for (const cmd of program.commands as CommandWithInternals[]) {
    const name = cmd.name()
    const description = cmd.description()
    const options: OptionInfo[] = []

    for (const opt of cmd.options as (Option & { argChoices?: string[] })[]) {
      const optName = opt.long || opt.short || ''
      if (optName) {
        options.push({
          name: optName,
          description: opt.description || '',
          choices: opt.argChoices
        })
        if (opt.short && opt.long) {
          options.push({
            name: opt.short,
            description: opt.description || '',
            choices: opt.argChoices
          })
        }
      }
    }

    const args = extractArguments(cmd)
    const subcommands =
      cmd.commands.length > 0
        ? (cmd.commands as CommandWithInternals[]).map((sub) => ({
            name: sub.name(),
            description: sub.description(),
            arguments: extractArguments(sub)
          }))
        : undefined

    commands.set(name, { description, options, arguments: args, subcommands })
  }

  return commands
}

/**
 * Handle shell completion
 */
export async function handleCompletion(program: Command): Promise<boolean> {
  const env = parseEnv()

  if (!env.complete) {
    return false
  }

  const commands = extractCommands(program)
  const commandNames = Array.from(commands.keys())

  // First word: suggest commands
  if (env.words === 1) {
    logCompletions(
      commandNames.map((name) => {
        const cmd = commands.get(name)!
        return { name, description: cmd.description }
      })
    )
    return true
  }

  // Get the command being completed
  const parts = env.line.split(' ').filter(Boolean)
  const cmdName = parts[1]
  const cmd = commands.get(cmdName)

  if (!cmd) {
    return true
  }

  // Handle option value completion
  const prevOption = cmd.options.find((opt) => opt.name === env.prev)
  if (prevOption?.choices) {
    // Extract option name for description lookup (e.g., '--provider' -> 'provider')
    const optName = prevOption.name.replace(/^-+/, '')
    logCompletions(choicesWithDescriptions(prevOption.choices, optName))
    return true
  }

  // Suggest options if typing -
  if (env.last.startsWith('-') || env.lastPartial.startsWith('-')) {
    logCompletions(cmd.options)
    return true
  }

  // Handle subcommands
  if (cmd.subcommands && env.words === 2) {
    logCompletions(
      cmd.subcommands.map((sub) => ({
        name: sub.name,
        description: sub.description
      }))
    )
    return true
  }

  // Handle subcommand argument completion
  if (cmd.subcommands && env.words >= 3) {
    const subName = parts[2]
    const sub = cmd.subcommands.find((s) => s.name === subName)
    if (sub?.arguments) {
      const argIndex = env.words - 3
      const arg = sub.arguments[argIndex]
      if (arg?.choices) {
        logCompletions(choicesWithDescriptions(arg.choices, arg.name))
        return true
      }
    }
  }

  // Handle command argument completion
  if (cmd.arguments && env.words >= 2) {
    const argIndex = env.words - 2
    const arg = cmd.arguments[argIndex]
    if (arg?.choices) {
      logCompletions(choicesWithDescriptions(arg.choices, arg.name))
      return true
    }
  }

  return true
}

/**
 * Install completion for the current shell
 */
export async function installCompletion(): Promise<void> {
  const shell = detectShell()
  const shellConfig = SHELL_CONFIGS[shell]
  const script = SCRIPT_TEMPLATES[shell]

  // Create completion directory
  if (!existsSync(COMPLETION_DIR)) {
    mkdirSync(COMPLETION_DIR, { recursive: true })
  }

  // Write completion script
  const scriptPath = join(COMPLETION_DIR, `gut.${shell}`)
  writeFileSync(scriptPath, script)
  console.log(`✓ Wrote completion script to ${scriptPath}`)

  // Check if already sourced in shell config
  let configContent = ''
  if (existsSync(shellConfig)) {
    configContent = readFileSync(shellConfig, 'utf-8')
  }

  const sourceLine =
    shell === 'fish'
      ? `[ -f ${scriptPath} ]; and . ${scriptPath}; or true`
      : `[[ -f ${scriptPath} ]] && . ${scriptPath} || true`

  if (configContent.includes(scriptPath)) {
    console.log(`✓ Already configured in ${shellConfig}`)
  } else {
    // Ensure directory exists for fish
    const configDir = dirname(shellConfig)
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    const addition = `\n# gut shell completion\n${sourceLine}\n`
    writeFileSync(shellConfig, configContent + addition)
    console.log(`✓ Added source line to ${shellConfig}`)
  }

  console.log(`\n✓ Shell completion installed for ${shell}!`)
  console.log('Please restart your shell or run:')
  console.log(`  source ${shellConfig}`)
}

/**
 * Uninstall completion
 */
export async function uninstallCompletion(): Promise<void> {
  const shell = detectShell()
  const shellConfig = SHELL_CONFIGS[shell]
  const scriptPath = join(COMPLETION_DIR, `gut.${shell}`)

  // Remove completion script
  if (existsSync(scriptPath)) {
    unlinkSync(scriptPath)
    console.log(`✓ Removed ${scriptPath}`)
  }

  // Remove source line from shell config
  if (existsSync(shellConfig)) {
    const configContent = readFileSync(shellConfig, 'utf-8')

    // Remove the gut completion block
    const lines = configContent.split('\n')
    const filtered = lines
      .filter((line, i) => {
        if (line.includes('# gut shell completion')) {
          // Skip this line and the next (source line)
          lines[i + 1] = ''
          return false
        }
        if (line.includes(`gut.${shell}`)) {
          return false
        }
        return true
      })
      .filter((line) => line !== undefined)

    writeFileSync(shellConfig, filtered.join('\n'))
    console.log(`✓ Removed source line from ${shellConfig}`)
  }

  console.log('✓ Shell completion uninstalled')
}
