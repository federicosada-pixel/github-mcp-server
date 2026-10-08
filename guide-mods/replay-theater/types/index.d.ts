export type ReplayEdit = {
  id: string
  filePath: string
  /** A unified-diff hunk (Code's `format: 'diff'`), or '' when the file was too large to diff. */
  diff: string
}

declare module 'claude-code' {
  interface PluginState {
    'replay-theater': {
      currentEdits: ReplayEdit[]
      lastTurnEdits: ReplayEdit[]
      stepIndex: number
      hasHint: boolean
    }
  }
}
