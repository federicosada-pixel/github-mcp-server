import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

type UsageCounts = { input: number; output: number; cacheRead: number }

const mockEngine = (on: On, resolvedModel: string, counts: UsageCounts) => {
  on('tool.call', ($, e) => {
    if (e.tool === 'Agent') {
      return {
        result: {
          status: 'async_launched' as const,
          agentId: 'sub1',
          description: e.description,
          resolvedModel,
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
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: {
        model: e.model,
        input_tokens: counts.input,
        output_tokens: counts.output,
        cache_read_input_tokens: counts.cacheRead,
        cache_creation_input_tokens: 0,
      },
    }
  })
}

const paneProps = () => ({
  title: 'Subagents',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

const runOneStep = async ($: Engine, model: string) => {
  await $.tool.call({ tool: 'Agent', description: 'Price check', prompt: 'p', model: 'sonnet' })

  const stream = $.turn.step({ turnId: 'sub-turn-1', index: 0, model, messageCount: 1, agentId: 'sub1' })

  for await (const _chunk of stream) {
    // drain
  }

  await stream.result

  return $.ui.mount({
    plugin: 'savvy-progress',
    surface: 'terminal',
    component: 'Pane',
    props: paneProps(),
    requestId: 'savvy-progress',
  })
}

const cases: { model: string; counts: UsageCounts; shown: string }[] = [
  // 1,000 in at $2 + 200 out at $10, per million
  { model: 'claude-sonnet-5-5', counts: { input: 1000, output: 200, cacheRead: 0 }, shown: '~$0.004' },
  // 1,000 in at $4 + 200 out at $20
  { model: 'claude-opus-5-5', counts: { input: 1000, output: 200, cacheRead: 0 }, shown: '~$0.008' },
  // 100,000 cache reads at $0.10 + 200 out at $10; the cached part is not charged as fresh input
  { model: 'claude-sonnet-5-5', counts: { input: 1000, output: 200, cacheRead: 100_000 }, shown: '~$0.012' },
  // Haiku 5.5 below 100k prompt tokens: $0.10 in, $0.50 out
  { model: 'claude-haiku-5-5', counts: { input: 10_000, output: 2000, cacheRead: 0 }, shown: '~$0.002' },
]

for (const { model, counts, shown } of cases) {
  test(`cost for ${model} with ${counts.cacheRead} cached tokens shows ${shown}`, async ($, on) => {
    mockEngine(on, model, counts)

    const pane = await runOneStep($, model)
    const detail = await pane.find({ type: 'Text', text: /msgs in context/ })

    expect(detail?.text).toContain(shown)
  })
}
