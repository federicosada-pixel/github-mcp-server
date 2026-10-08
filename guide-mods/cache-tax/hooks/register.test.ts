import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const MINUTE = 60_000

const mockEngine = (on: On) => {
  const clock = mock.clock(on, { now: 0 })
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: {
        model: e.model,
        input_tokens: 1_000,
        output_tokens: 100,
        cache_read_input_tokens: 99_000,
        cache_creation_input_tokens: 0,
      },
    }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('model.fork', () => ({
    value: {
      isAnswered: true as const,
      text: 'ok',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  return clock
}

const step = async ($: Engine, agentId?: string) => {
  const stream = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-opus-5-5',
    messageCount: 10,
    ...(agentId === undefined ? {} : { agentId }),
  })

  for await (const _chunk of stream) {
    // drain
  }

  await stream.result
}

const SUBMIT = {
  text: 'where were we?',
  wait: false,
  origin: { kind: 'composer' as const },
}

const keepwarm = (args: string) => ({
  command: 'keepwarm',
  args,
  origin: { kind: 'sdk' as const },
  presentation: { isFullscreen: false, columns: 80 },
})

test('a prompt sent while the cache is warm goes straight through', async ($, on) => {
  const clock = mockEngine(on)

  await step($)
  await clock.set(30 * MINUTE)

  const result = await $.prompt.submit(SUBMIT)

  expect(result.drop).toBeUndefined()
})

test('a prompt sent after the cache went cold is held once with a cost estimate', async ($, on) => {
  const clock = mockEngine(on)

  await step($)
  await clock.set(90 * MINUTE)

  const first = await $.prompt.submit(SUBMIT)

  expect(first.drop).toContain('went cold 1h 30m ago')
  expect(first.drop).toContain('100,000 tokens')
  expect(first.drop).toContain('$3.00')

  const second = await $.prompt.submit(SUBMIT)

  expect(second.drop).toBeUndefined()
})

test("a subagent's steps do not count as the main thread's cache", async ($, on) => {
  const clock = mockEngine(on)

  await step($, 'sub1')
  await clock.set(90 * MINUTE)

  const result = await $.prompt.submit(SUBMIT)

  expect(result.drop).toBeUndefined()
})

test('/keepwarm stops the hold, and /keepwarm off turns it back on', async ($, on) => {
  const clock = mockEngine(on)

  await step($)

  expect((await $.command.run(keepwarm('90m'))).text).toContain('keepwarm on for 1h 30m')

  await clock.set(70 * MINUTE)
  expect((await $.prompt.submit(SUBMIT)).drop).toBeUndefined()

  expect((await $.command.run(keepwarm('off'))).text).toBe('keepwarm off.')
  expect((await $.command.run(keepwarm('soon'))).text).toContain('Usage')
})
