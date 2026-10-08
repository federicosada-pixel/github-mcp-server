export type PendingRule = { text: string; original: string } | null

declare module 'claude-code' {
  interface PluginState {
    reflect: { pending: PendingRule; isEditing: boolean; draft: string }
  }
}
