import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const RULE = 'Always use pnpm instead of npm in this repository.'

const mockEngine = (on: On) => {
  const clock = mock.clock(on)
  const files = new Map<string, string>()
  on('fs.exists', ($, e) => ({ value: files.has(e.path) }))
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.classify', () => ({ value: 'correction' }))
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: RULE,
      usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))

  return clock
}

const SUBMIT = {
  text: 'no, in this repo we always use pnpm, not npm',
  attachments: undefined,
  context: undefined,
  turnId: undefined,
  wait: false,
  origin: { kind: 'composer' } as const,
}

const abovePromptProps = () => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

for (const surface of ['terminal', 'desktop', 'mobile', 'vscode'] as const) {
  test(`the suggestion band is drawn on ${surface}`, async ($, on) => {
    const clock = mockEngine(on)

    await $.prompt.submit(SUBMIT)
    await clock.settle()

    const ui = await $.ui.mount({
      plugin: 'reflect',
      surface,
      component: 'AbovePrompt',
      props: abovePromptProps(),
    })

    expect((await ui.find({ type: 'Text' }))?.text).toContain('Always use pnpm')
    expect(await ui.find({ type: 'Button', key: 'save' })).toBeDefined()

    // Only mobile lacks an Input, so only there is the Edit button left out.
    const edit = await ui.find({ type: 'Button', key: 'edit' })
    if (surface === 'mobile') {
      expect(edit).toBeUndefined()
    } else {
      expect(edit).toBeDefined()
    }
  })
}
