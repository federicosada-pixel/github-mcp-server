import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// What a mod beneath this one draws in the band; it must still show.
const BELOW = { type: 'Box' as const, children: [{ type: 'Text' as const, children: ['below-row'] }] }

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
  on('ui.render', () => BELOW)

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

const TURN_COMPLETE = {
  answer: '',
  durationMs: 100,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
}

for (const surface of ['terminal', 'desktop', 'mobile', 'vscode'] as const) {
  test(`the hint draws on ${surface} and stacks above the band beneath`, async ($, on) => {
    const files = mockEngine(on)

    await $.turn.start({ text: 'fix it', turnId: 't1' })
    files.set('a.ts', 'a\n')
    await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'A' })
    await $.turn.complete(TURN_COMPLETE)

    const ui = await $.ui.mount({
      plugin: 'replay-theater',
      surface,
      component: 'AbovePrompt',
      props: abovePromptProps(),
    })

    expect((await ui.find({ type: 'Text', text: /changed/ }))?.text).toContain('1 file changed')
    expect((await ui.find({ type: 'Text', text: 'below-row' }))?.text).toBe('below-row')
  })
}
