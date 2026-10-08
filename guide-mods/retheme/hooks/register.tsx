import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ThemeName, Timing } from '../types'

const TIMING_CAP = 200

type Palette = {
  accent: string
  dim: string
  add: string
  remove: string
  text: string
  border: string
}

const THEMES: Record<ThemeName, Palette> = {
  noir: { accent: '#e0e0e0', dim: '#707070', add: '#9ccc65', remove: '#ef5350', text: '#f5f5f5', border: 'single' },
  'tokyo-night': {
    accent: '#7aa2f7',
    dim: '#565f89',
    add: '#9ece6a',
    remove: '#f7768e',
    text: '#c0caf5',
    border: 'round',
  },
  dracula: { accent: '#bd93f9', dim: '#6272a4', add: '#50fa7b', remove: '#ff5555', text: '#f8f8f2', border: 'round' },
  catppuccin: {
    accent: '#cba6f7',
    dim: '#6c7086',
    add: '#a6e3a1',
    remove: '#f38ba8',
    text: '#cdd6f4',
    border: 'round',
  },
}

const ICONS: Record<string, string> = {
  Read: '\u{1F4D6}',
  Edit: '✏️',
  Write: '\u{1F4DD}',
  Bash: '▶',
  Grep: '\u{1F50D}',
  Glob: '\u{1F50E}',
  WebFetch: '\u{1F310}',
  WebSearch: '\u{1F52D}',
  Agent: '\u{1F916}',
  TodoWrite: '☑️',
}

const skin = atom({ plugin: 'retheme', key: 'skin' } as const, null)
const timings = atom({ plugin: 'retheme', key: 'timings' } as const, {})

const summarize = (input: unknown): string => {
  if (typeof input !== 'object' || input === null) {
    return ''
  }

  const record = input as Record<string, unknown>
  const field = record.file_path ?? record.command ?? record.pattern ?? record.query ?? record.prompt

  return typeof field === 'string' ? field.slice(0, 60) : ''
}

const isStructuredPatchOutput = (
  output: unknown,
): output is { filePath: string; structuredPatch: { lines: string[] }[] } =>
  typeof output === 'object' &&
  output !== null &&
  'structuredPatch' in output &&
  Array.isArray((output as { structuredPatch: unknown }).structuredPatch)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skin',
      description: 'Restyle tool rows and diffs: noir, tokyo-night, dracula, catppuccin, off',
      argumentHint: '<theme>',
    })

    return next(e)
  })

  on('command.run', { command: 'skin' }, async ($, e) => {
    const name = e.args.trim().toLowerCase()

    if (name === '' || name === 'off') {
      await update($, skin, () => null)

      return { text: name === 'off' ? 'Skin turned off.' : `Themes: ${Object.keys(THEMES).join(', ')}, off` }
    }

    if (!(name in THEMES)) {
      return { text: `Unknown theme "${name}". Try: ${Object.keys(THEMES).join(', ')}` }
    }

    await update($, skin, () => name as ThemeName)

    return { text: `Skin set to ${name}.` }
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const ran = await next(e)
    const endedAt = await $.clock.now()
    const entry: Timing = { startedAt, endedAt }
    await update($, timings, map => {
      const keys = Object.keys(map)
      const trimmed: Record<string, Timing> =
        keys.length >= TIMING_CAP
          ? Object.fromEntries(
              keys.slice(keys.length - TIMING_CAP + 1).flatMap(k => {
                const value = map[k]

                return value === undefined ? [] : [[k, value] as const]
              }),
            )
          : map

      return { ...trimmed, [e.tool_use_id]: entry }
    })

    return ran
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const theme = await read($, skin)

    if (theme === null) {
      return next(e)
    }

    const palette = THEMES[theme]
    const timingMap = await read($, timings)
    const timing = timingMap[e.props.tool_use_id]
    const now = await $.clock.now()
    const elapsedMs =
      timing === undefined ? undefined : (e.props.isRunning ? now : (timing.endedAt ?? now)) - timing.startedAt
    const icon = ICONS[e.props.tool] ?? '•'
    const statusColor = e.props.isRunning
      ? palette.accent
      : e.props.isErrored
        ? palette.remove
        : e.props.isInterrupted
          ? palette.dim
          : palette.add
    const statusWord = e.props.isRunning
      ? 'running'
      : e.props.isErrored
        ? 'error'
        : e.props.isInterrupted
          ? 'interrupted'
          : 'done'
    const detail = summarize(e.props.input)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={palette.text}>
          {icon} {e.props.tool}
        </Text>
        {detail !== '' && <Text color={palette.dim}> {detail}</Text>}
        <Text color={statusColor}>
          {' '}
          {statusWord}
          {elapsedMs !== undefined ? ` ${(elapsedMs / 1000).toFixed(1)}s` : ''}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const theme = await read($, skin)

    if (theme === null || e.props.tool !== 'Edit' || !isStructuredPatchOutput(e.props.output)) {
      return next(e)
    }

    const palette = THEMES[theme]
    const output = e.props.output
    const lines = output.structuredPatch.flatMap(hunk => hunk.lines)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" borderStyle={palette.border} borderColor={palette.accent} padding={1}>
        <Text color={palette.text} bold>
          {output.filePath}
        </Text>
        {lines.map((line: string, index: number) => (
          <Text
            key={`${index}`}
            color={line.startsWith('+') ? palette.add : line.startsWith('-') ? palette.remove : palette.dim}
          >
            {line}
          </Text>
        ))}
      </Box>
    )
  })
}
