import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// What a mod beneath this one draws in the band; it must still show.
const BELOW = { type: 'Box' as const, children: [{ type: 'Text' as const, children: ['below-row'] }] }

const mockEngine = (on: On) => {
  mock.clock(on)
  on('tool.call', () => ({ result: {}, text: '' }))
  on('ui.render', () => BELOW)
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
  test(`the bubble draws on ${surface} and stacks above the band beneath`, async ($, on) => {
    mockEngine(on)

    await $.tool.call({ tool: 'Read', file_path: 'a.md' })

    const ui = await $.ui.mount({
      plugin: 'file-tracker',
      surface,
      component: 'AbovePrompt',
      props: abovePromptProps(),
    })

    expect((await ui.find({ type: 'Text', text: /touched/ }))?.text).toContain('1 touched')
    expect((await ui.find({ type: 'Text', text: 'below-row' }))?.text).toBe('below-row')
  })
}

test('the band beneath still shows while the bubble is hidden', async ($, on) => {
  mockEngine(on)

  await $.tool.call({ tool: 'Read', file_path: 'a.md' })

  const ui = await $.ui.mount({
    plugin: 'file-tracker',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })
  await ui.press({ key: 'hide' })

  const hidden = await $.ui.mount({
    plugin: 'file-tracker',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
    requestId: 'after-hide',
  })

  expect(await hidden.find({ type: 'Text', text: /touched/ })).toBeUndefined()
  expect((await hidden.find({ type: 'Text', text: 'below-row' }))?.text).toBe('below-row')
})
