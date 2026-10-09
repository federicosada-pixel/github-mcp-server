import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const mockFiles = (on: On) => {
  const files = new Map<string, string>()

  on('fs.exists', ($, e) => ({ value: files.has(e.path) }))
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })

  return files
}

const mockEnv = (on: On, vars: Record<string, string>) => {
  on('env.get', ($, e) => ({ value: vars[e.name] }))
}

const mockModel = (on: On, { label, ruleText }: { label: string; ruleText: string }) => {
  on('model.classify', () => ({ value: label }))
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: ruleText,
      usage: {
        input_tokens: 10,
        output_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  }))
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

test('a plain message raises no suggestion', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.toast', () => ({ value: undefined }))
  mockModel(on, { label: 'other', ruleText: 'unused' })

  await $.prompt.submit(SUBMIT)
  await clock.settle()

  const ui = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  expect(await ui.find({ type: 'Text' })).toBeUndefined()
})

test('a correction raises a suggestion, and Save appends it to ./CLAUDE.md', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.toast', () => ({ value: undefined }))
  const files = mockFiles(on)
  mockModel(on, { label: 'correction', ruleText: 'Always use pnpm instead of npm in this repository.' })

  await $.prompt.submit(SUBMIT)
  await clock.settle()

  const ui = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  expect((await ui.find({ type: 'Text' }))?.text).toContain('Always use pnpm')

  await ui.press({ key: 'save' })

  expect([...files.values()].join('\n')).toContain(
    '- Always use pnpm instead of npm in this repository.',
  )
})

test('Global saves to $HOME/.claude/CLAUDE.md instead', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.toast', () => ({ value: undefined }))
  const files = mockFiles(on)
  mockEnv(on, { HOME: '/home/person' })
  mockModel(on, { label: 'correction', ruleText: 'Always use pnpm instead of npm in this repository.' })

  await $.prompt.submit(SUBMIT)
  await clock.settle()

  const ui = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  await ui.press({ key: 'global' })

  expect(files.get('/home/person/.claude/CLAUDE.md')).toContain('Always use pnpm')
  expect(files.has('./CLAUDE.md')).toBe(false)
})

test('Edit lets you change the wording before it is saved', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.toast', () => ({ value: undefined }))
  const files = mockFiles(on)
  mockModel(on, { label: 'correction', ruleText: 'Always use pnpm instead of npm in this repository.' })

  await $.prompt.submit(SUBMIT)
  await clock.settle()

  const ui = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  await ui.press({ key: 'edit' })
  await ui.input({ key: 'rule-input', text: 'Use pnpm, never npm or yarn.' })

  expect([...files.values()].join('\n')).toContain('- Use pnpm, never npm or yarn.')
})

test('Skip dismisses the suggestion without writing anything', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.toast', () => ({ value: undefined }))
  const files = mockFiles(on)
  mockModel(on, { label: 'correction', ruleText: 'Always use pnpm instead of npm in this repository.' })

  await $.prompt.submit(SUBMIT)
  await clock.settle()

  const ui = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  await ui.press({ key: 'skip' })

  const after = await $.ui.mount({
    plugin: 'reflect',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
    requestId: 'after-skip',
  })

  expect(await after.find({ type: 'Text' })).toBeUndefined()
  expect(files.has('./CLAUDE.md')).toBe(false)
})
