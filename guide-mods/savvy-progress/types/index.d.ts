export type SubagentInfo = {
  id: string
  description: string
  model: string
  isDone: boolean
  toolCalls: number
  messageCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': { subagents: SubagentInfo[]; isOpen: boolean }
  }
}
