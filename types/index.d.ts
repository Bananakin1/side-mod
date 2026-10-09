export type Exchange = { question: string; answer: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    'side-chat': {
      exchanges: Exchange[]
      pending: string | null
      generation: number
    }
  }
}
