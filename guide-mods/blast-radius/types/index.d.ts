export type PendingCommand = {
  id: string
  command: string
  files: string[]
  totalCount: number
  isTruncated: boolean
} | null

declare module 'claude-code' {
  interface PluginState {
    'blast-radius': { pending: PendingCommand }
  }
}
