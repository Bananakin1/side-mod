# side-chat

A Claude Code mod: an ephemeral side conversation in a pane, like `/btw` with follow-ups.

- Each side question forks the main thread at its latest point, so it sees the conversation so far.
- The main thread's last reply and the side Q&A so far ride along, so follow-ups keep their thread.
- Nothing from the side chat is written to the main conversation's history.
- Closing the pane (Esc) or `/side clear` discards the side chat.

## Install

```
/plugin install side-chat --marketplace Bananakin1/side-mod
```

Answer `y` to add the marketplace, then pick the user scope.

## Use

- `/side` opens the pane; type a question and press Enter. Follow-ups work the same way.
- `/side clear` resets the side history.
- Esc closes the pane and discards the side chat.

## Limits

- No tools: the side chat reasons over the conversation, it cannot read files or run commands.
- Uses the main thread's model, so the shared prefix is read from the prompt cache.
- Keeps the last 10 side exchanges.
- Typing `/side` leaves an empty command line in the main transcript; questions and answers never do.
- Before the main thread's first reply, or right after `/clear`, there is nothing to fork.
- Panes draw in the terminal and the desktop app; the mobile app has no input field, and the VS Code chat panel draws no mod UI.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
