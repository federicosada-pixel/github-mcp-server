import { expect, mock, test } from 'claude-code/testing'

const RING = {
  command: 'ring',
  args: '',
  origin: { kind: 'sdk' } as const,
  presentation: { isFullscreen: false, columns: 80 },
}

test('/ring reports nothing before any file or page is touched', async $ => {
  const { text } = await $.command.run(RING)

  expect(text).toBe('Nothing tracked yet.')
})

test('tracks files and pages, and /ring lists them', async ($, on) => {
  mock.clock(on)
  on('tool.call', ($, e) => ({ result: {}, text: '' }))

  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  await $.tool.call({ tool: 'Edit', file_path: 'b.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'summarize' })

  const { text } = await $.command.run(RING)

  expect(text).toBe(
    ['file  a.md', 'file  b.ts', 'page  https://example.com'].join('\n'),
  )
})

const abovePromptProps = (hasSurvey: boolean) => ({
  hasSurvey,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

test('the band shows the touched count and the last item once something is tracked', async ($, on) => {
  mock.clock(on)
  on('tool.call', ($, e) => ({ result: {}, text: '' }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))

  await $.tool.call({ tool: 'Read', file_path: 'a.md' })

  const quiet = await $.ui.mount({
    plugin: 'file-tracker',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(true),
  })

  expect(await quiet.find({ type: 'Text' })).toBeUndefined()

  const ui = await $.ui.mount({
    plugin: 'file-tracker',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(false),
  })

  expect((await ui.find({ type: 'Text' }))?.text).toContain('1 touched')
  expect((await ui.find({ type: 'Text' }))?.text).toContain('a.md')

  await ui.press({ key: 'hide' })

  const hidden = await $.ui.mount({
    plugin: 'file-tracker',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(false),
    requestId: 'after-hide',
  })

  expect(await hidden.find({ type: 'Text' })).toBeUndefined()
})
