import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'side-chat',
  props: { title: 'Side chat', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

for (const surface of ['terminal', 'desktop'] as const) {
test(`${surface}: side questions fork the main thread with its last reply and the side history`, async ($, on) => {
  const prompts: string[] = []
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'main question', toolUses: [] },
      { role: 'assistant', text: 'MAIN REPLY 42', toolUses: [] },
    ],
  }))
  on('model.fork', (_$, e) => {
    prompts.push(e.prompt)
    return {
      value: {
        isAnswered: true,
        text: `answer ${prompts.length}`,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })

  {
    const ui = await $.ui.mount({ plugin: 'side-chat', surface, ...PANE })

    await ui.input({ key: 'question', text: 'first?' })
    expect(prompts[0]).toContain('MAIN REPLY 42')
    expect(prompts[0]).toContain('first?')
    expect(prompts[0]).not.toContain('side_chat_so_far')
    expect(await ui.find({ type: 'Markdown', text: /answer 1/ })).toBeDefined()

    await ui.input({ key: 'question', text: 'follow-up?' })
    expect(prompts[1]).toContain('Q: first?\nA: answer 1')
    expect(prompts[1]).toContain('follow-up?')
    expect(await ui.find({ type: 'Markdown', text: /answer 2/ })).toBeDefined()

    await ui.unmount()
  }
})
}

test('nothing to fork is shown in the pane, not thrown', async ($, on) => {
  on('session.messages', () => ({ value: [] }))
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
  const ui = await $.ui.mount({ plugin: 'side-chat', surface: 'terminal', ...PANE })
  await ui.input({ key: 'question', text: 'anything?' })
  expect(await ui.find({ type: 'Markdown', text: /Nothing to fork yet/ })).toBeDefined()
  await ui.unmount()
})
