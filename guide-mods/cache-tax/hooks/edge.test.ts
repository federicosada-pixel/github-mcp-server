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

  return clock
}

const step = async ($: Engine, model: string) => {
  const stream = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 10 })

  for await (const _chunk of stream) {
    // drain
  }

  await stream.result
}

const SUBMIT = { text: 'where were we?', wait: false, origin: { kind: 'composer' as const } }

const cases = [
  // 100,000 tokens re-written at 2x the input price, warm at the cache-read price
  { model: 'claude-haiku-5-5', cold: '~$0.02', warm: '~$0.00' },
  { model: 'claude-sonnet-5-5', cold: '~$0.40', warm: '~$0.01' },
  { model: 'claude-fable-5-1', cold: '~$2.00', warm: '~$0.03' },
  // An unknown model falls back to Sonnet 5.5 prices
  { model: 'claude-mystery-9', cold: '~$0.40', warm: '~$0.01' },
]

for (const { model, cold, warm } of cases) {
  test(`a cold cache on ${model} is priced ${cold} cold and ${warm} warm`, async ($, on) => {
    const clock = mockEngine(on)

    await step($, model)
    await clock.set(90 * MINUTE)

    const { drop } = await $.prompt.submit(SUBMIT)

    expect(drop).toContain(`(${cold};`)
    expect(drop).toContain(`cost ${warm})`)
  })
}
