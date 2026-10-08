import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PendingCommand } from '../types'

const PANE = 'blast-radius'
const FILE_CAP = 50
const PROCEED = 'Proceed'
const CANCEL = 'Cancel'

const pending = atom({ plugin: 'blast-radius', key: 'pending' } as const, null)

const tokenize = (command: string) => command.trim().split(/\s+/).filter(t => t.length > 0)

const hasFlag = (tokens: readonly string[], short: string, long: string) =>
  tokens.some(
    t => (t.startsWith('-') && !t.startsWith('--') && t.slice(1).includes(short)) || t === `--${long}`,
  )

type Risk =
  | { kind: 'rm'; paths: string[]; cwd?: string }
  | { kind: 'git-clean'; extraArgs: string[]; cwd?: string }

const detectRisk = (command: string): Risk | undefined => {
  let cwd: string | undefined

  for (const segment of command.split(/&&|;|\|/)) {
    const tokens = tokenize(segment)

    if (tokens[0] === 'cd' && tokens[1] !== undefined) {
      cwd = tokens[1]
      continue
    }

    if (tokens[0] === 'rm' && hasFlag(tokens, 'r', 'recursive') && hasFlag(tokens, 'f', 'force')) {
      const paths = tokens.slice(1).filter(t => !t.startsWith('-'))

      if (paths.length > 0) {
        return { kind: 'rm', paths, cwd }
      }
    }

    if (tokens[0] === 'git' && tokens[1] === 'clean' && hasFlag(tokens.slice(2), 'f', 'force')) {
      const extraArgs = tokens.slice(2).filter(t => !t.startsWith('-'))

      return { kind: 'git-clean', extraArgs, cwd }
    }
  }

  return undefined
}

const findFiles = async ($: EngineInterface, path: string, cwd: string | undefined) => {
  const found = await $.process.run(['find', path], { cwd }).catch(() => undefined)

  if (found === undefined || found.exitCode !== 0) {
    return [path]
  }

  return found.stdout.split('\n').filter(line => line.length > 0)
}

const cleanFiles = async ($: EngineInterface, extraArgs: readonly string[], cwd: string | undefined) => {
  const dryRun = await $.process
    .run(['git', 'clean', '-fdn', ...extraArgs], { cwd })
    .catch(() => undefined)

  if (dryRun === undefined) {
    return []
  }

  return dryRun.stdout
    .split('\n')
    .map(line => line.replace(/^Would (remove|skip) /, ''))
    .filter(line => line.length > 0)
}

const computeAffected = async ($: EngineInterface, risk: Risk) => {
  const all =
    risk.kind === 'rm'
      ? (await Promise.all(risk.paths.map(p => findFiles($, p, risk.cwd)))).flat()
      : await cleanFiles($, risk.extraArgs, risk.cwd)

  return {
    files: all.slice(0, FILE_CAP),
    totalCount: all.length,
    isTruncated: all.length > FILE_CAP,
  }
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const risk = detectRisk(e.command)

    if (risk === undefined) {
      return next(e)
    }

    const affected = await computeAffected($, risk)
    const record: PendingCommand = {
      id: e.tool_use_id,
      command: e.command,
      files: affected.files,
      totalCount: affected.totalCount,
      isTruncated: affected.isTruncated,
    }
    await update($, pending, () => record)
    await $.ui.open({ id: PANE, title: 'Blast Radius' })

    // A `$` call in flight stops the hook's 10s budget, so the person can take their time.
    const asked = await $.ui
      .ask(`Run "${e.command}"? It would delete ${affected.totalCount} path(s), listed in the Blast Radius pane.`, {
        options: [CANCEL, PROCEED],
        header: 'Blast Radius',
      })
      .then(
        answer => ({ answer, failure: undefined }),
        (error: unknown) => ({ answer: CANCEL, failure: error instanceof Error ? error.message : String(error) }),
      )

    await update($, pending, () => null)
    await $.ui.close({ id: PANE })

    if (asked.failure !== undefined) {
      return { deny: `blast-radius: held, the question could not be asked (${asked.failure}).` }
    }

    if (asked.answer !== PROCEED) {
      return { deny: 'blast-radius: cancelled before it ran.' }
    }

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'blast-radius: its guard failed.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const record = await read($, pending)
    const { Box, Text } = $.ui.resolve(e)

    if (record === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Nothing held.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text>{record.command}</Text>
        <Text dimColor>
          {record.totalCount} path{record.totalCount === 1 ? '' : 's'} would go:
        </Text>
        {record.files.map(file => (
          <Text key={file} dimColor>
            {file}
          </Text>
        ))}
        {record.isTruncated && <Text dimColor>...and {record.totalCount - record.files.length} more</Text>}
      </Box>
    )
  })
}
