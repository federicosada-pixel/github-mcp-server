import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const mockEngine = (on: On) => {
  mock.clock(on, { now: 1000 })
  on('tool.call', () => ({ result: {}, text: '' }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
}

const run = (args: string) => ({
  command: 'skin',
  args,
  origin: { kind: 'sdk' as const },
  presentation: { isFullscreen: false, columns: 80 },
})

const toolUseProps = () => ({
  tool_use_id: 'call-1',
  tool: 'Read',
  input: { file_path: 'src/app.ts' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
})

const editResultProps = () => ({
  tool_use_id: 'call-2',
  tool: 'Edit',
  isErrored: false,
  output: {
    filePath: 'src/app.ts',
    oldString: 'a',
    newString: 'b',
    originalFile: 'a\n',
    structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }],
    userModified: false,
    replaceAll: false,
  },
})

test('with no skin set, tool rows are left to the engine', async ($, on) => {
  mockEngine(on)

  const ui = await $.ui.mount({
    plugin: 'retheme',
    surface: 'terminal',
    component: 'ToolUse',
    props: toolUseProps(),
    requestId: 'call-1',
  })

  expect(await ui.find({ type: 'Text' })).toBeUndefined()
})

test('/skin dracula restyles tool rows with an icon, the tool and its status', async ($, on) => {
  mockEngine(on)

  const { text } = await $.command.run(run('dracula'))
  expect(text).toBe('Skin set to dracula.')

  const ui = await $.ui.mount({
    plugin: 'retheme',
    surface: 'terminal',
    component: 'ToolUse',
    props: toolUseProps(),
    requestId: 'call-1',
  })

  expect((await ui.find({ type: 'Text', text: /Read/ }))?.text).toContain('Read')
  expect((await ui.find({ type: 'Text', text: /done/ }))?.text).toContain('done')
  expect((await ui.find({ type: 'Text', text: /src\/app\.ts/ }))?.text).toContain('src/app.ts')
})

test('an Edit result becomes a diff card with its removed and added lines', async ($, on) => {
  mockEngine(on)

  await $.command.run(run('tokyo-night'))

  const ui = await $.ui.mount({
    plugin: 'retheme',
    surface: 'terminal',
    component: 'ToolResult',
    props: editResultProps(),
    requestId: 'call-2',
  })

  expect((await ui.find({ type: 'Text', text: '-a' }))?.text).toBe('-a')
  expect((await ui.find({ type: 'Text', text: '+b' }))?.text).toBe('+b')
})

test('an unknown theme is refused and /skin off restores the default', async ($, on) => {
  mockEngine(on)

  expect((await $.command.run(run('neon'))).text).toContain('Unknown theme')

  await $.command.run(run('noir'))
  expect((await $.command.run(run('off'))).text).toBe('Skin turned off.')

  const ui = await $.ui.mount({
    plugin: 'retheme',
    surface: 'terminal',
    component: 'ToolUse',
    props: toolUseProps(),
    requestId: 'call-1',
  })

  expect(await ui.find({ type: 'Text' })).toBeUndefined()
})
