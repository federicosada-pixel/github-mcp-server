// file-tracker: bubble above the prompt + /ring, tracking files and pages touched
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TrackedItem } from '../types'

const FILE_TOOLS = ['Read', 'Edit', 'Write'] as const

const items = atom({ plugin: 'file-tracker', key: 'items' } as const, [])
const isHidden = atom({ plugin: 'file-tracker', key: 'isHidden' } as const, false)

type Touched = { kind: TrackedItem['kind']; label: string; count: number }

// Claude Code's own folder (mods, config) and the mods' type-check helpers are not your work.
const isNoise = (kind: TrackedItem['kind'], label: string) =>
  kind === 'file' && (label.includes('/.claude/') || /(^|\/)tsconfig\.[\w-]+\.json$/.test(label))

// One row per file or page, newest touch first, with how many times it was touched.
const summarize = (list: readonly TrackedItem[]): Touched[] => {
  const seen = new Map<string, Touched>()

  for (const one of list) {
    if (isNoise(one.kind, one.label)) {
      continue
    }

    const key = `${one.kind}\u0000${one.label}`
    const count = (seen.get(key)?.count ?? 0) + 1
    seen.delete(key)
    seen.set(key, { kind: one.kind, label: one.label, count })
  }

  return [...seen.values()].reverse()
}

const add = async ($: EngineInterface, kind: TrackedItem['kind'], label: string) => {
  if (isNoise(kind, label)) {
    return
  }

  const at = await $.clock.now()
  const entry: TrackedItem = { id: `${kind}:${label}:${at}`, kind, label, at }
  await update($, items, list => [...list, entry].slice(-200))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ring',
      description: 'List every file and page Claude has touched this session, newest first',
    })

    return next(e)
  })

  on('command.run', { command: 'ring' }, async $ => {
    const touched = summarize(await read($, items))

    if (touched.length === 0) {
      return { text: 'Nothing tracked yet.' }
    }

    const lines = touched.map(
      one => `${one.kind}  ${one.label}${one.count > 1 ? `  ×${one.count}` : ''}`,
    )

    return { text: lines.join('\n') }
  })

  on('tool.call', { tool: FILE_TOOLS }, async ($, e, next) => {
    await add($, 'file', e.file_path)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    await add($, 'file', e.notebook_path)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'WebFetch' }, async ($, e, next) => {
    await add($, 'page', e.url)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const touched = summarize(await read($, items))
    const hidden = await read($, isHidden)
    const last = touched[0]

    if (e.props.hasSurvey || hidden || last === undefined) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    // The band is one instance shared by every mod: stack this row above whatever is beneath.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box>
        <Text dimColor>
          {touched.length} touched &middot; last: {last.label}{' '}
        </Text>
        <Button
          key="hide"
          label="Hide"
          hotkey="h"
          onPress={async () => {
            await update($, isHidden, () => true)
            $.ui.toast('file-tracker: hidden. Use /ring to see what was tracked.')
          }}
        />
        </Box>
        {below}
      </Box>
    )
  })
}
