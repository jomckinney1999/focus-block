# Undercurrent

**Flow has a sound.** Music that follows your keyboard. Type and it rises to meet you. Stop to think and it softens. Walk away and it lets you go. You never press play. You just start working.

- **In flow**: you're typing, the music plays.
- **Thinking**: a pause longer than *your* usual thinking pause (it learns), and the music dips to half loudness over 45 seconds. Reading and scrolling keep it there.
- **Away**: five minutes with no activity, and it fades to silence over two minutes.
- **Back**: three keystrokes and it returns mid-phrase.

Five built-in tracks, all synthesized live with no streaming: Bach's Prelude in C, baroque variations on Pachelbel's ground, Satie-style piano, an ambient pad, and brown noise. Or point it at your own stream.

Every transition is slow on purpose: sudden changes in sound pull attention, and the point is to stay out of your way. See RESEARCH.md in the repository for the studies behind each default.

## Use

1. Open the **Undercurrent** panel and click once to allow audio.
2. Start typing.

`Ctrl+Alt+M` / `Cmd+Alt+M` plays and pauses. Command palette: **Undercurrent: Choose Music**, **Keep Playing While I Read…**, **Relearn My Typing Rhythm**.

## Privacy

Undercurrent only notices *that* the file in front of you changed, never *what* you typed. Nothing leaves your machine. What it learns (your pause lengths and session times) is stored in VS Code's local extension storage.
