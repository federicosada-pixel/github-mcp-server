import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const mockEngine = (on: On) => {
  on('tool.call', ($, e) => ({ result: {}, text: '' }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    const [cmd, ...rest] = e.argv

    if (cmd === 'find') {
      const path = rest[0] ?? ''

      return {
        value: {
          exitCode: 0,
          stdout: `${path}\n${path}/a.txt\n${path}/b.txt\n`,
          stderr: '',
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      }
    }

    if (cmd === 'git' && rest[0] === 'clean') {
      return {
        value: {
          exitCode: 0,
          stdout: 'Would remove untracked.log\nWould remove dist/\n',
          stderr: '',
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      }
    }

    return {
      value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
}

const paneProps = () => ({
  title: 'Blast Radius',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

test('a harmless command passes straight through, no pane opens', async ($, on) => {
  mockEngine(on)

  const result = await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(result.deny).toBeUndefined()
})

test('rm -rf lists the affected files and Cancel denies the command', async ($, on) => {
  const clock = mock.clock(on)
  mockEngine(on)

  const callPromise = $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await clock.settle()

  const pane = await $.ui.mount({
    plugin: 'blast-radius',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'blast-radius',
  })

  expect((await pane.find({ type: 'Text', text: 'rm -rf build' }))?.text).toBe('rm -rf build')
  expect((await pane.find({ type: 'Text', text: 'build/a.txt' }))?.text).toBe('build/a.txt')

  await pane.press({ key: 'cancel' })

  const result = await callPromise

  expect(result.deny).toContain('cancelled')
})

test('Proceed lets the command run', async ($, on) => {
  const clock = mock.clock(on)
  mockEngine(on)

  const callPromise = $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await clock.settle()

  const pane = await $.ui.mount({
    plugin: 'blast-radius',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'blast-radius',
  })

  await pane.press({ key: 'proceed' })

  const result = await callPromise

  expect(result.deny).toBeUndefined()
})

test('git clean -fd lists what the dry run would remove', async ($, on) => {
  const clock = mock.clock(on)
  mockEngine(on)

  const callPromise = $.tool.call({ tool: 'Bash', command: 'git clean -fd' })
  await clock.settle()

  const pane = await $.ui.mount({
    plugin: 'blast-radius',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'blast-radius',
  })

  expect((await pane.find({ type: 'Text', text: 'untracked.log' }))?.text).toBe('untracked.log')

  await pane.press({ key: 'cancel' })
  await callPromise
})

test('rm without both -r and -f is not held', async ($, on) => {
  mockEngine(on)

  const result = await $.tool.call({ tool: 'Bash', command: 'rm -f single-file.txt' })

  expect(result.deny).toBeUndefined()
})
