import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SubagentInfo } from '../types'

const PANE = 'savvy-progress'

const subagents = atom({ plugin: 'savvy-progress', key: 'subagents' } as const, [])
const isOpen = atom({ plugin: 'savvy-progress', key: 'isOpen' } as const, false)

// Published list prices in dollars per million tokens (docs.claude.com pricing). Not your actual bill.
// Haiku 5.5 is priced at its rate for prompts up to 100k tokens. First match wins.
const PRICE_TABLE: ReadonlyArray<{ match: string; input: number; output: number; cacheRead: number }> = [
  { match: 'fable', input: 10, output: 50, cacheRead: 0.25 },
  { match: 'opus-5', input: 4, output: 20, cacheRead: 0.2 },
  { match: 'sonnet-5', input: 2, output: 10, cacheRead: 0.1 },
  { match: 'haiku-5', input: 0.1, output: 0.5, cacheRead: 0.01 },
  { match: 'opus', input: 5, output: 25, cacheRead: 0.5 },
  { match: 'sonnet', input: 3, output: 15, cacheRead: 0.3 },
  { match: 'haiku', input: 1, output: 5, cacheRead: 0.1 },
]
const DEFAULT_PRICE = { input: 2, output: 10, cacheRead: 0.1 }
const CACHE_WRITE_MULTIPLIER = 1.25

const priceFor = (model: string) => {
  const lower = model.toLowerCase()

  return PRICE_TABLE.find(row => lower.includes(row.match)) ?? DEFAULT_PRICE
}

const estimateCost = (agent: SubagentInfo) => {
  const price = priceFor(agent.model)
  const fresh = Math.max(0, agent.inputTokens - agent.cacheReadTokens - agent.cacheCreationTokens)
  const dollars =
    (fresh * price.input +
      agent.cacheReadTokens * price.cacheRead +
      agent.cacheCreationTokens * price.input * CACHE_WRITE_MULTIPLIER +
      agent.outputTokens * price.output) /
    1_000_000

  return dollars
}

const withAgent = (list: readonly SubagentInfo[], id: string, change: (a: SubagentInfo) => SubagentInfo) =>
  list.map(a => (a.id === id ? change(a) : a))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agents-info',
      description: 'Open or close the subagent progress panel',
    })

    return next(e)
  })

  on('command.run', { command: 'agents-info' }, async $ => {
    const open = await update($, isOpen, open => !open)

    if (open) {
      await $.ui.open({ id: PANE, title: 'Subagents' })
    } else {
      await $.ui.close({ id: PANE })
    }

    return { text: open ? 'Subagent panel opened.' : 'Subagent panel closed.' }
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny !== undefined) {
      return ran
    }

    const raw = ran.result

    if (typeof raw !== 'object' || raw === null || !('agentId' in raw)) {
      return ran
    }

    // The Agent tool's own result: cast once we've confirmed the shared
    // `agentId` field at runtime (ToolResultOf<'Agent'> comes back as
    // `unknown` to the type checker in a generic tool.call hook).
    const record = raw as {
      agentId: string
      resolvedModel?: string
      status?: string
    }

    const info: SubagentInfo = {
      id: record.agentId,
      description: e.description,
      model: record.resolvedModel || e.model || 'default',
      isDone: record.status === 'completed',
      toolCalls: 0,
      messageCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    }
    await update($, subagents, list => [...list.filter(a => a.id !== info.id), info])

    return ran
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'savvy-progress: its guard failed.' }))

  on('tool.call', async ($, e, next) => {
    const result = await next(e)

    if ('agentId' in e && e.agentId !== undefined) {
      const id = e.agentId
      await update($, subagents, list => withAgent(list, id, a => ({ ...a, toolCalls: a.toolCalls + 1 })))
    }

    return result
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    if (e.agentId !== undefined && result.usage !== null) {
      const id = e.agentId
      const usage = result.usage
      await update($, subagents, list =>
        withAgent(list, id, a => ({
          ...a,
          model: usage.model,
          messageCount: e.messageCount,
          inputTokens: a.inputTokens + usage.input_tokens,
          outputTokens: a.outputTokens + usage.output_tokens,
          cacheReadTokens: a.cacheReadTokens + usage.cache_read_input_tokens,
          cacheCreationTokens: a.cacheCreationTokens + usage.cache_creation_input_tokens,
        })),
      )
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      await update($, subagents, list => withAgent(list, id, a => ({ ...a, isDone: true })))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, subagents)

    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const running = list.filter(a => !a.isDone).length
    const totalCost = list.reduce((sum, a) => sum + estimateCost(a), 0)
    const { Box, Text } = $.ui.resolve(e)
    // The band is one instance shared by every mod: stack this row above whatever is beneath.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {running} running, {list.length - running} done &middot; ~${totalCost.toFixed(2)} so far
          &middot; /agents-info{' '}
        </Text>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, subagents)
    const { Box, Text } = $.ui.resolve(e)

    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No subagents yet.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {list.map(agent => (
          <Box key={agent.id} flexDirection="column">
            <Text>
              {agent.isDone ? 'done' : 'running'} &middot; {agent.model} &middot; {agent.description}
            </Text>
            <Text dimColor>
              {agent.toolCalls} tool call{agent.toolCalls === 1 ? '' : 's'} &middot;{' '}
              {agent.messageCount} msgs in context &middot; ~${estimateCost(agent).toFixed(3)}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
