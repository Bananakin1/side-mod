import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Exchange } from '../types'

const PANE = 'side-chat'
const MAX_EXCHANGES = 10
const MAX_CATCHUP = 20000
const MAX_ANSWER_IN_PROMPT = 8000

const exchanges = atom({ plugin: 'side-chat', key: 'exchanges' } as const, [])
const pending = atom({ plugin: 'side-chat', key: 'pending' } as const, null)
const generation = atom({ plugin: 'side-chat', key: 'generation' } as const, 0)

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}\n[... cut ...]` : text

// The fork replays the main thread's last request, which does not hold the
// reply that request produced; hand the latest main-thread reply over in text.
async function latestMainReply($: EngineInterface): Promise<string> {
  const messages = await $.session.messages()
  if (!Array.isArray(messages)) return ''
  const last =[...messages].reverse().find(m => m.role === 'assistant' && m.text.trim() !== '')
  return last ? clip(last.text, MAX_CATCHUP) : ''
}

export function buildPrompt(catchUp: string, history: Exchange[], question: string): string {
  const parts = [
    'SIDE CHAT. This is a side conversation the person opened beside the main thread. ' +
      'It is not part of the main conversation and will not be recorded in it. ' +
      'You have no tools here: answer from the conversation above and the side chat below. ' +
      'Do not continue the main task; just answer the side question.',
  ]
  if (catchUp) {
    parts.push(
      `<latest_main_reply note="the main thread's most recent reply; may already appear above">\n${catchUp}\n</latest_main_reply>`,
    )
  }
  if (history.length > 0) {
    const turns = history
      .filter(x => !x.isError)
      .map(x => `Q: ${x.question}\nA: ${clip(x.answer, MAX_ANSWER_IN_PROMPT)}`)
      .join('\n\n')
    if (turns) parts.push(`<side_chat_so_far>\n${turns}\n</side_chat_so_far>`)
  }
  parts.push(`<side_question>\n${question}\n</side_question>`)
  return parts.join('\n\n')
}

async function ask($: EngineInterface, question: string) {
  if ((await read($, pending)) !== null) {
    $.ui.toast('Side chat is still answering.')
    return
  }
  const gen = await read($, generation)
  const history = await read($, exchanges)
  await update($, pending, () => question)

  let result: Awaited<ReturnType<EngineInterface['model']['fork']>>
  try {
    result = await $.model.fork({
      prompt: buildPrompt(await latestMainReply($), history, question),
    })
  } catch (err) {
    if ((await read($, generation)) !== gen) return
    const answer = `Side chat failed: ${err instanceof Error ? err.message : String(err)}`
    await update($, exchanges, list => [...list, { question, answer, isError: true }].slice(-MAX_EXCHANGES))
    await update($, pending, () => null)
    return
  }

  // Cleared or closed while the fork ran: drop the late answer.
  if ((await read($, generation)) !== gen) return
  const exchange: Exchange = result.isAnswered
    ? { question, answer: result.text, isError: false }
    : {
        question,
        answer:
          result.reason === 'nothing-to-fork'
            ? 'Nothing to fork yet: the main thread has no reply (new session or just after /clear).'
            : `No reply (${result.reason}).`,
        isError: true,
      }
  await update($, exchanges, list => [...list, exchange].slice(-MAX_EXCHANGES))
  await update($, pending, () => null)
}

async function reset($: EngineInterface) {
  await update($, generation, n => n + 1)
  await update($, exchanges, () => [])
  await update($, pending, () => null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'side',
      description: 'Side chat beside the main thread (not saved to it); "/side clear" resets',
    })
    return next(e)
  })

  // No `text`: keep the command's own transcript line empty.
  on('command.run', { command: 'side' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await reset($)
      $.ui.toast('Side chat cleared.')
      return {}
    }
    await $.ui.open({ id: PANE, title: 'Side chat', focus: true, closeOnEscape: true })
    return {}
  })

  // Closing the pane ends the side conversation.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await reset($).catch(() => undefined)
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Markdown } = elements
    // The mobile app draws no input field yet.
    const Input = 'Input' in elements ? elements.Input : undefined
    const list = await read($, exchanges)
    const waiting = await read($, pending)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 4) / 6))

    return (
      <Box flexDirection="column">
        {list.length === 0 && waiting === null && (
          <Text dimColor>
            Ask about the main conversation. Nothing here reaches its history. Esc closes and
            discards.
          </Text>
        )}
        {list.slice(-room).map(x => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>› {x.question}</Text>
            <Markdown text={x.answer} dimColor={x.isError} />
          </Box>
        ))}
        {waiting !== null && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>› {waiting}</Text>
            <Text dimColor>thinking…</Text>
          </Box>
        )}
        {Input === undefined && <Text dimColor>This surface has no input field; use a terminal or desktop.</Text>}
        {Input !== undefined && <Input
          key="question"
          placeholder={waiting === null ? 'Side question…' : 'Answering…'}
          value=""
          submitLabel="ask"
          autoFocus
          onSubmit={(text: string) => {
            const q = text.trim()
            if (q) void ask($, q)
          }}
        />}
      </Box>
    )
  })
}
