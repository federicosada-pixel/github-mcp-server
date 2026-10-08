export type Millis = number

declare module 'claude-code' {
  interface PluginState {
    'cache-tax': {
      lastActiveAt: Millis | null
      cachedTokens: number
      model: string
      warnedFor: Millis | null
      keepwarmUntil: Millis | null
    }
  }
}
