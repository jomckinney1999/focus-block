# Undercurrent

**Flow has a sound.** Focus music for programmers that follows your keyboard: type and it rises to meet you, pause to think and it softens, walk away and it lets you go. You never press play. You just start working.

```
flow/
├── engine/          shared core (plain JS, runs in Node and the browser)
│   ├── flow-model.js    typing → flow state → target level (pure, clock-injected, tested)
│   └── audio-engine.js  Web Audio synth: 5 tracks, reverb, dB ramps, suspend on silence
├── vscode/          the product: a VS Code extension
│   ├── extension.js     watches edits/navigation, runs the model, drives the status bar
│   └── media/           the player webview (makes the sound)
├── index.html, web/ landing page with a live "type here" demo
├── test/            node --test suites
└── RESEARCH.md      why every default is what it is
```

## How it behaves

| State | When | Music |
|---|---|---|
| **In flow** | You're typing | Full level |
| **Thinking** | No typing for longer than your usual thinking pause (learned; starts at 60 s) | Dips −9 dB over 45 s. Scrolling and reading keep it here. |
| **Away** | 5 min with no typing *or* navigation | Fades to silence over 2 min; audio engine sleeps |
| **Back** | 3 edits within 15 s | Returns in ~6 s, mid-phrase |

Full rationale and citations: [RESEARCH.md](RESEARCH.md).

## Music

All synthesized live, with no audio files, streaming, or licensing:

- **Prelude**: J. S. Bach, Prelude in C major, BWV 846 (public domain)
- **Ground**: generative baroque variations over Pachelbel's ground bass
- **Drift**: sparse piano in the spirit of Satie's Gymnopédies
- **Tide**: ambient pad, no melody
- **Brown noise**
- Or your own stream: set `undercurrent.customStreamUrl`

## Try it

```bash
cd flow
npm test                 # model, extension smoke test, engine sync check
python3 -m http.server   # then open http://localhost:8000 for the landing page + live demo
```

### VS Code extension

```bash
cd flow/vscode
npm run package          # syncs the engine and builds undercurrent-0.1.0.vsix
code --install-extension undercurrent-0.1.0.vsix
```

Or open `flow/vscode` in VS Code and press F5 to run it in an Extension Development Host. After editing anything in `flow/engine/`, run `npm run sync` (the extension carries its own copy; a test fails if they drift).

Open the **Undercurrent** panel, click once to allow audio, then type. `Ctrl+Alt+M` / `Cmd+Alt+M` plays and pauses. Settings live under **Settings → Undercurrent**.

## Known limits

- Only typing inside VS Code is detected. Time spent in a browser reading docs counts as "away" unless you use **Keep Playing While I Read**.
- Browsers and some VS Code builds need one click before audio can play; the panel shows a prompt when that's needed.
- The player panel must have been opened once per window (`startOnLaunch` does this automatically).
