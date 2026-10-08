// file-tracker: bubble above the prompt + /ring, tracking files and pages touched
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TrackedItem } from '../types'

const FILE_TOOLS = ['Read', 'Edit', 'Write'] as const

const items = atom({ plugin: 'file-tracker', key: 'items' } as const, [])
const isHidden = atom({ plugin: 'file-tracker', key: 'isHidden' } as const, false)

const add = async ($: EngineInterface, kind: TrackedItem['kind'], label: string) => {
  const at = await $.clock.now()
  const entry: TrackedItem = { id: `${kind}:${label}:${at}`, kind, label, at }
  await update($, items, list => [...list, entry].slice(-200))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ring',
      description: 'List every file and page Claude has touched this session',
    })

    return next(e)
  })

  on('command.run', { command: 'ring' }, async $ => {
    const list = await read($, items)

    if (list.length === 0) {
      return { text: 'Nothing tracked yet.' }
    }

    const lines = list.map(one => `${one.kind}  ${one.label}`)

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
    const list = await read($, items)
    const hidden = await read($, isHidden)
    const quiet = e.props.hasSurvey || list.length === 0 || hidden

    if (quiet) {
      return next(e)
    }

    const last = list[list.length - 1]

    if (last === undefined) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>
          {list.length} touched &middot; last: {last.label}{' '}
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
    )
  })
}
