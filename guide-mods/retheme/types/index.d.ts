export type ThemeName = 'noir' | 'tokyo-night' | 'dracula' | 'catppuccin'

export type Timing = { startedAt: number; endedAt?: number }

declare module 'claude-code' {
  interface PluginState {
    'retheme': {
      skin: ThemeName | null
      timings: Record<string, Timing>
    }
  }
}
