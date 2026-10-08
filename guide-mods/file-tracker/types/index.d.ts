export type TrackedItem = {
  id: string
  kind: 'file' | 'page'
  label: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'file-tracker': { items: TrackedItem[]; isHidden: boolean }
  }
}
