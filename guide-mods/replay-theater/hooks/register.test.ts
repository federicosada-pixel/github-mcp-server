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
    } else if (e.tool === 'Write') {
      files.set(e.file_path, e.content)
    }

    return { result: {}, text: '' }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))

  return files
}

const abovePromptProps = () => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

const paneProps = () => ({
  title: 'Replay',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

const TURN_COMPLETE = {
  answer: '',
  durationMs: 100,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
}

test('two edits in a turn raise a hint naming the count', async ($, on) => {
  const files = mockEngine(on)

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  files.set('a.ts', 'one\ntwo\nthree\n')
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'two', new_string: 'TWO' })
  await $.tool.call({ tool: 'Write', file_path: 'b.ts', content: 'brand new\n' })
  await $.turn.complete(TURN_COMPLETE)

  const ui = await $.ui.mount({
    plugin: 'replay-theater',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  expect((await ui.find({ type: 'Text' }))?.text).toContain('2 files changed')
})

test('the pane shows the diff of the first edit, with removed and added lines', async ($, on) => {
  const files = mockEngine(on)

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  files.set('a.ts', 'one\ntwo\nthree\n')
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'two', new_string: 'TWO' })
  await $.turn.complete(TURN_COMPLETE)

  const pane = await $.ui.mount({
    plugin: 'replay-theater',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'replay',
  })

  const diff = await pane.find({ type: 'Code' })

  expect(diff?.text).toContain('-two')
  expect(diff?.text).toContain('+TWO')
  expect((await pane.find({ type: 'Text' }))?.text).toContain('step 1 of 1')
})

test('Next and Prev step between several edits', async ($, on) => {
  const files = mockEngine(on)

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  files.set('a.ts', 'a\n')
  files.set('b.ts', 'b\n')
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'A' })
  await $.tool.call({ tool: 'Edit', file_path: 'b.ts', old_string: 'b', new_string: 'B' })
  await $.turn.complete(TURN_COMPLETE)

  const pane = await $.ui.mount({
    plugin: 'replay-theater',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'replay',
  })

  expect((await pane.find({ type: 'Text' }))?.text).toContain('step 1 of 2')

  await pane.press({ key: 'next' })
  expect((await pane.find({ type: 'Text' }))?.text).toContain('step 2 of 2')

  await pane.press({ key: 'next' })
  expect((await pane.find({ type: 'Text' }))?.text).toContain('step 2 of 2')

  await pane.press({ key: 'prev' })
  expect((await pane.find({ type: 'Text' }))?.text).toContain('step 1 of 2')
})

test('Dismiss hides the hint without opening the pane', async ($, on) => {
  const files = mockEngine(on)

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  files.set('a.ts', 'a\n')
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'A' })
  await $.turn.complete(TURN_COMPLETE)

  const ui = await $.ui.mount({
    plugin: 'replay-theater',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  await ui.press({ key: 'dismiss' })

  const after = await $.ui.mount({
    plugin: 'replay-theater',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
    requestId: 'after-dismiss',
  })

  expect(await after.find({ type: 'Text' })).toBeUndefined()
})

test('a turn with no edits raises no hint', async ($, on) => {
  const files = mockEngine(on)

  await $.turn.start({ text: 'just chatting', turnId: 't1' })
  await $.turn.complete(TURN_COMPLETE)

  const ui = await $.ui.mount({
    plugin: 'replay-theater',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  expect(await ui.find({ type: 'Text' })).toBeUndefined()
})
