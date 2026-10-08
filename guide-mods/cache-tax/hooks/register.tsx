import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

const MINUTE = 60_000
const CACHE_TTL_MS = 60 * MINUTE
const PING_EVERY_MS = 50 * MINUTE
const DEFAULT_KEEPWARM_MS = 6 * 60 * MINUTE

const lastActiveAt = atom({ plugin: 'cache-tax', key: 'lastActiveAt' } as const, null)
const cachedTokens = atom({ plugin: 'cache-tax', key: 'cachedTokens' } as const, 0)
const model = atom({ plugin: 'cache-tax', key: 'model' } as const, '')
const warnedFor = atom({ plugin: 'cache-tax', key: 'warnedFor' } as const, null)
const keepwarmUntil = atom({ plugin: 'cache-tax', key: 'keepwarmUntil' } as const, null)

// Rough, built-in estimate: dollars per million input tokens. Not your actual bill.
const INPUT_PRICE: ReadonlyArray<{ match: string; perMillion: number }> = [
  { match: 'opus', perMillion: 15 },
  { match: 'sonnet', perMillion: 3 },
  { match: 'haiku', perMillion: 0.8 },
  { match: 'fable', perMillion: 1 },
]
const CACHE_WRITE_MULTIPLIER = 2
const CACHE_READ_MULTIPLIER = 0.1

let pinger: Timer | undefined

const inputPrice = (name: string) =>
  INPUT_PRICE.find(row => name.toLowerCase().includes(row.match))?.perMillion ?? 3

const formatAge = (ms: number) => {
  const minutes = Math.floor(ms / MINUTE)

  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

const parseDuration = (text: string) => {
  const match = /^(\d+)\s*(m|h)?$/.exec(text.trim())

  if (match === null) {
    return undefined
  }

  return Number(match[1]) * (match[2] === 'h' ? 60 * MINUTE : MINUTE)
}

const stopKeepwarm = async ($: EngineInterface) => {
  pinger?.cancel()
  pinger = undefined
  await update($, keepwarmUntil, () => null)
  $.ui.status(undefined)
}

const ping = async ($: EngineInterface) => {
  const until = await read($, keepwarmUntil)
  const now = await $.clock.now()

  if (until === null || now >= until) {
    await stopKeepwarm($)

    return
  }

  const reply = await $.model.fork({ prompt: 'Keep-alive ping: reply with just "ok".' })

  if (reply.isAnswered) {
    await update($, lastActiveAt, () => now)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'keepwarm',
      description: 'Keep the prompt cache warm while you step away (default 6h)',
      argumentHint: '[90m | 2h | off]',
    })

    return next(e)
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'off') {
      await stopKeepwarm($)

      return { text: 'keepwarm off.' }
    }

    const span = arg === '' ? DEFAULT_KEEPWARM_MS : parseDuration(arg)

    if (span === undefined) {
      return { text: 'Usage: /keepwarm, /keepwarm 90m, /keepwarm 2h, /keepwarm off' }
    }

    const until = (await $.clock.now()) + span
    await update($, keepwarmUntil, () => until)
    pinger?.cancel()
    pinger = $.clock.every(PING_EVERY_MS, () => void ping($))
    $.ui.status(`keepwarm on for ${formatAge(span)}`)

    return {
      text: `keepwarm on for ${formatAge(span)}: one cache-read ping every 50m while Claude Code stays open.`,
    }
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    if (e.agentId === undefined && result.usage !== null) {
      const usage = result.usage
      const now = await $.clock.now()
      await update(
        $,
        cachedTokens,
        () => usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
      )
      await update($, model, () => usage.model)
      await update($, lastActiveAt, () => now)
    }

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const last = await read($, lastActiveAt)
    const tokens = await read($, cachedTokens)
    const now = await $.clock.now()
    const isOwnPrompt = e.origin === undefined || e.origin.kind === 'composer'

    if (!isOwnPrompt || last === null || tokens === 0 || now - last < CACHE_TTL_MS) {
      return next(e)
    }

    if ((await read($, warnedFor)) === last || (await read($, keepwarmUntil)) !== null) {
      return next(e)
    }

    await update($, warnedFor, () => last)

    const price = inputPrice(await read($, model))
    const cold = (tokens * price * CACHE_WRITE_MULTIPLIER) / 1_000_000
    const warm = (tokens * price * CACHE_READ_MULTIPLIER) / 1_000_000

    return {
      drop:
        `cache-tax: the prompt cache went cold ${formatAge(now - last)} ago. ` +
        `Sending this re-writes ~${tokens.toLocaleString('en-US')} tokens (~$${cold.toFixed(2)}; ` +
        `a warm turn would have cost ~$${warm.toFixed(2)}). Send it again to pay it, ` +
        `or /clear and start from a note. Estimate only, not your bill.`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))
}
