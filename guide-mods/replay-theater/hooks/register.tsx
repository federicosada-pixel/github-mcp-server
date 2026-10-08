import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ReplayEdit } from '../types'

const PANE = 'replay'
const DIFF_LINE_CAP = 1200

const currentEdits = atom({ plugin: 'replay-theater', key: 'currentEdits' } as const, [])
const lastTurnEdits = atom({ plugin: 'replay-theater', key: 'lastTurnEdits' } as const, [])
const stepIndex = atom({ plugin: 'replay-theater', key: 'stepIndex' } as const, 0)
const hasHint = atom({ plugin: 'replay-theater', key: 'hasHint' } as const, false)

const diffLines = (oldLines: readonly string[], newLines: readonly string[]) => {
  const n = oldLines.length
  const m = newLines.length
  const width = m + 1
  const lcs = new Array<number>((n + 1) * width).fill(0)
  const at = (i: number, j: number) => lcs[i * width + j] ?? 0
  const set = (i: number, j: number, v: number) => {
    lcs[i * width + j] = v
  }

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const isSame = oldLines[i] === newLines[j]
      set(i, j, isSame ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1)))
    }
  }

  const out: string[] = []
  let i = 0
  let j = 0

  while (i < n && j < m) {
    const oldLine = oldLines[i]
    const newLine = newLines[j]

    if (oldLine !== undefined && oldLine === newLine) {
      out.push(` ${oldLine}`)
      i += 1
      j += 1
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      out.push(`-${oldLine ?? ''}`)
      i += 1
    } else {
      out.push(`+${newLine ?? ''}`)
      j += 1
    }
  }

  while (i < n) {
    out.push(`-${oldLines[i] ?? ''}`)
    i += 1
  }

  while (j < m) {
    out.push(`+${newLines[j] ?? ''}`)
    j += 1
  }

  return out
}

const buildDiff = (before: string, after: string) => {
  const oldLines = before === '' ? [] : before.split('\n')
  const newLines = after === '' ? [] : after.split('\n')

  if (oldLines.length + newLines.length > DIFF_LINE_CAP) {
    return ''
  }

  const header = `@@ -1,${oldLines.length} +1,${newLines.length} @@`

  return [header, ...diffLines(oldLines, newLines)].join('\n')
}

const openReplay = async ($: EngineInterface) => {
  await update($, stepIndex, () => 0)
  await update($, hasHint, () => false)
  await $.ui.open({ id: PANE, title: 'Replay' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'replay',
      description: 'Step through every file edit Claude made last turn, one diff at a time',
    })

    return next(e)
  })

  on('command.run', { command: 'replay' }, async $ => {
    await openReplay($)

    return { text: 'Replay opened.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, currentEdits, () => [])

    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const before = await $.fs.read(e.file_path).catch(() => '')
    const result = await next(e)

    if (result.deny !== undefined || result.isError === true) {
      return result
    }

    const after = await $.fs.read(e.file_path).catch(() => '')
    const edit: ReplayEdit = {
      id: e.tool_use_id,
      filePath: e.file_path,
      diff: buildDiff(before, after),
    }
    await update($, currentEdits, list => [...list, edit])

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const edits = await read($, currentEdits)

    if (edits.length > 0) {
      await update($, lastTurnEdits, () => edits)
      await update($, stepIndex, () => 0)
      await update($, hasHint, () => true)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const show = await read($, hasHint)

    if (e.props.hasSurvey || !show) {
      return next(e)
    }

    const edits = await read($, lastTurnEdits)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>
          replay &middot; {edits.length} file{edits.length === 1 ? '' : 's'} changed last
          turn{' '}
        </Text>
        <Button key="replay" label="Replay" hotkey="r" onPress={() => openReplay($)} />
        <Button
          key="dismiss"
          label="Dismiss"
          hotkey="d"
          onPress={() => update($, hasHint, () => false)}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const edits = await read($, lastTurnEdits)
    const { Box, Button, Code, Text } = $.ui.resolve(e)

    if (edits.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No edits recorded last turn.</Text>
        </Box>
      )
    }

    const index = Math.min(await read($, stepIndex), edits.length - 1)
    const edit = edits[index]

    if (edit === undefined) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No edits recorded last turn.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>
          step {index + 1} of {edits.length} &middot; {edit.filePath}
        </Text>
        {edit.diff === '' ? (
          <Text dimColor>File too large to diff.</Text>
        ) : (
          <Code key="diff" source={edit.diff} format="diff" path={edit.filePath} />
        )}
        <Box>
          <Button
            key="prev"
            label="Prev"
            hotkey="p"
            onPress={() => update($, stepIndex, n => Math.max(0, n - 1))}
          />
          <Button
            key="next"
            label="Next"
            hotkey="n"
            onPress={() => update($, stepIndex, n => Math.min(edits.length - 1, n + 1))}
          />
          <Button key="close" label="Close" hotkey="c" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
