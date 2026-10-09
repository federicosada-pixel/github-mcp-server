import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const mockEngine = (on: On) => {
  const files = new Map<string, string>()

  on('fs.read', ($, e) => {
    const key = [...files.keys()].find(k => e.path.endsWith(k))

    return { value: key === undefined ? '' : (files.get(key) ?? '') }
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'Edit') {
      files.set(e.file_path, (files.get(e.file_path) ?? '').replace(e.old_string, e.new_string))
    }

    return { result: {}, text: '' }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))

  return files
}

const paneProps = () => ({
  title: 'Replay',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

test('an edit to a file past the diff cap is listed but not diffed', async ($, on) => {
  const files = mockEngine(on)
  const big = `${Array.from({ length: 1300 }, (_, i) => `line ${i}`).join('\n')}\n`

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  files.set('big.ts', big)
  await $.tool.call({ tool: 'Edit', file_path: 'big.ts', old_string: 'line 5\n', new_string: 'LINE 5\n' })
  await $.turn.complete({ answer: '', durationMs: 100, isAborted: false, turnId: 't1', reason: 'answer' })

  const pane = await $.ui.mount({
    plugin: 'replay-theater',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'replay',
  })

  expect((await pane.find({ type: 'Text', text: /step/ }))?.text).toContain('step 1 of 1')
  expect((await pane.find({ type: 'Text', text: /too large/ }))?.text).toBe('File too large to diff.')
  expect(await pane.find({ type: 'Code' })).toBeUndefined()
})
