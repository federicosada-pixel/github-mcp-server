import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const mockEngine = (on: On) => {
  on('tool.call', ($, e) => {
    if (e.tool === 'Agent') {
      return {
        result: {
          status: 'async_launched' as const,
          agentId: 'sub1',
          description: e.description,
          resolvedModel: e.model === 'opus' ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
          prompt: e.prompt,
          outputFile: '/tmp/out.txt',
        },
        text: '',
      }
    }

    return { result: {}, text: '' }
  })
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: {
        model: e.model,
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }
  })
  on('turn.complete', ($, e) => ({ text: '' }))
}

const paneProps = () => ({
  title: 'Subagents',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

const abovePromptProps = () => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

test('spawning a subagent records it as running', async ($, on) => {
  mockEngine(on)

  await $.tool.call({
    tool: 'Agent',
    description: 'Add JSDoc to src functions',
    prompt: 'add jsdoc',
    model: 'sonnet',
  })

  const pane = await $.ui.mount({
    plugin: 'savvy-progress',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'savvy-progress',
  })

  const row = await pane.find({ type: 'Text', text: /Add JSDoc/ })

  expect(row?.text).toContain('running')
  expect(row?.text).toContain('claude-sonnet-5-5')
})

test('the band above the prompt shows how many are running and a cost estimate', async ($, on) => {
  mockEngine(on)

  await $.tool.call({
    tool: 'Agent',
    description: 'Add JSDoc to src functions',
    prompt: 'add jsdoc',
    model: 'sonnet',
  })

  const ui = await $.ui.mount({
    plugin: 'savvy-progress',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: abovePromptProps(),
  })

  expect((await ui.find({ type: 'Text' }))?.text).toContain('1 running, 0 done')
})

test('turn.step usage for the subagent accumulates its cost and context size', async ($, on) => {
  mockEngine(on)

  await $.tool.call({
    tool: 'Agent',
    description: 'Write greet() node:test file',
    prompt: 'write a test',
    model: 'sonnet',
  })

  const stream = $.turn.step({
    turnId: 'sub-turn-1',
    index: 0,
    model: 'claude-sonnet-5-5',
    messageCount: 4,
    agentId: 'sub1',
  })

  for await (const _chunk of stream) {
    // no chunks expected from this hook; just drain the stream
  }

  await stream.result

  const pane = await $.ui.mount({
    plugin: 'savvy-progress',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'savvy-progress',
  })

  const detail = await pane.find({ type: 'Text', text: /msgs in context/ })

  expect(detail?.text).toContain('4 msgs in context')
})

test('/agents-info opens and closes the panel', async ($, on) => {
  mockEngine(on)

  const opened = await $.command.run({
    command: 'agents-info',
    args: '',
    origin: { kind: 'sdk' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  expect(opened.text).toContain('opened')

  const closed = await $.command.run({
    command: 'agents-info',
    args: '',
    origin: { kind: 'sdk' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  expect(closed.text).toContain('closed')
})

test('a turn ending for the subagent marks it done', async ($, on) => {
  mockEngine(on)

  await $.tool.call({
    tool: 'Agent',
    description: 'Write greet() node:test file',
    prompt: 'write a test',
    model: 'sonnet',
  })

  await $.turn.complete({
    answer: 'done',
    durationMs: 500,
    isAborted: false,
    turnId: 'sub-turn-1',
    reason: 'answer',
    agentId: 'sub1',
  })

  const pane = await $.ui.mount({
    plugin: 'savvy-progress',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'savvy-progress',
  })

  const row = await pane.find({ type: 'Text', text: /Write greet/ })

  expect(row?.text).toContain('done')
})
