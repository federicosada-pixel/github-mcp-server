import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const mockEngine = (on: On) => {
  mock.clock(on, { now: 1000 })
  on('tool.call', () => ({ result: {}, text: '' }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
}

const skin = (args: string) => ({
  command: 'skin',
  args,
  origin: { kind: 'sdk' as const },
  presentation: { isFullscreen: false, columns: 80 },
})

const toolUseProps = () => ({
  tool_use_id: 'call-1',
  tool: 'Edit',
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

for (const surface of ['terminal', 'desktop', 'mobile', 'vscode'] as const) {
  test(`dracula draws the tool row and the diff card on ${surface}`, async ($, on) => {
    mockEngine(on)
    await $.command.run(skin('dracula'))

    const row = await $.ui.mount({
      plugin: 'retheme',
      surface,
      component: 'ToolUse',
      props: toolUseProps(),
      requestId: 'call-1',
    })
    expect((await row.find({ type: 'Text', text: /Edit/ }))?.text).toContain('Edit')

    const card = await $.ui.mount({
      plugin: 'retheme',
      surface,
      component: 'ToolResult',
      props: editResultProps(),
      requestId: 'call-2',
    })
    expect((await card.find({ type: 'Text', text: '+b' }))?.text).toBe('+b')
  })
}
