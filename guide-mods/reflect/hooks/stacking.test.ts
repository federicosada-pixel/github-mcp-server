import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// What a mod beneath this one draws in the band; it must still show.
const BELOW = { type: 'Box' as const, children: [{ type: 'Text' as const, children: ['below-row'] }] }

const mockEngine = (on: On) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => BELOW)
  on('model.classify', () => ({ value: 'correction' }))
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: 'Always use pnpm instead of npm in this repository.',
      usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))

  return clock
}

const abovePromptProps = () => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

test('the suggestion stacks above the band beneath instead of replacing it', async ($, on) => {
  const clock = mockEngine(on)

  await $.prompt.submit({
    text: 'no, in this repo we always use pnpm, not npm',
    attachments: undefined,
    context: undefined,
    turnId: undefined,
    wait: false,
    origin: { kind: 'composer' },
  })
  await clock.settle()

  const ui = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  expect((await ui.find({ type: 'Text', text: /reflect/ }))?.text).toContain('Always use pnpm')
  expect((await ui.find({ type: 'Text', text: 'below-row' }))?.text).toBe('below-row')
})

test('with nothing to suggest, the band beneath is passed through untouched', async ($, on) => {
  mockEngine(on)

  const ui = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  expect(await ui.find({ type: 'Text', text: /reflect/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: 'below-row' }))?.text).toBe('below-row')
})
