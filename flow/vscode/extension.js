'use strict';
/*
 * Undercurrent for VS Code.
 *
 * The extension host watches the editor (edits = typing, scroll/cursor/file
 * switches = reading) and runs FlowModel. The webview in the panel only makes
 * sound: it receives { db, rampMs } targets and plays them. Keeping the model
 * here means timers are reliable and what it learns persists in globalState.
 */
const vscode = require('vscode');
const crypto = require('crypto');
const FlowModel = require('./media/engine/flow-model.js');

const VIEW_ID = 'undercurrent.player';
const LEARNED_KEY = 'undercurrent.learned';
const WELCOMED_KEY = 'undercurrent.welcomed';

const TRACKS = [
  { id: 'prelude', label: 'Prelude', detail: 'J. S. Bach, Prelude in C major, BWV 846' },
  { id: 'ground', label: 'Ground', detail: "Baroque variations over Pachelbel's ground bass" },
  { id: 'drift', label: 'Drift', detail: "Sparse piano, in the spirit of Satie's Gymnopédies" },
  { id: 'tide', label: 'Tide', detail: 'Ambient pad, no melody' },
  { id: 'brown', label: 'Brown noise', detail: 'Low, steady noise' },
  { id: 'noir', label: 'Noir', detail: 'Late-night jazz: walking bass, brushes, smoky keys' },
  { id: 'lofi', label: 'Lo-fi', detail: 'Dusky lo-fi beats with vinyl crackle' },
  { id: 'rain', label: 'Rain', detail: 'Steady rain' },
  { id: 'waves', label: 'Waves', detail: 'Slow ocean swells' },
  { id: 'hearth', label: 'Hearth', detail: 'A crackling fire over a warm hum' },
];

const STATE_TEXT = {
  flow: { icon: '$(pulse)', word: 'In flow' },
  soft: { icon: '$(pulse)', word: 'Thinking' },
  resting: { icon: '$(mute)', word: 'Resting' },
  paused: { icon: '$(debug-pause)', word: 'Paused' },
};

function cfg() {
  return vscode.workspace.getConfiguration('undercurrent');
}

function modelOptions() {
  const c = cfg();
  const softenAfter = Number(c.get('softenAfterSeconds', 0));
  return {
    adaptive: !(softenAfter > 0),
    graceMs: softenAfter > 0 ? softenAfter * 1000 : FlowModel.DEFAULTS.graceMs,
    softDb: Math.min(0, Math.max(-30, Number(c.get('softLevelDb', -9)))),
    restAfterMs: Math.max(1, Number(c.get('awayAfterMinutes', 5))) * 60_000,
  };
}

function fmtDuration(ms) {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

class Player {
  constructor(context) {
    this.context = context;
    this.model = new FlowModel(modelOptions(), context.globalState.get(LEARNED_KEY));
    this.view = null;
    this.audioReady = false;
    this.dirty = false;

    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.status.command = 'undercurrent.toggle';
    this.status.show();
    context.subscriptions.push(this.status);
    this.render();
  }

  // ---- model plumbing ----

  apply(transition) {
    if (!transition) return;
    this.dirty = true;
    this.post({ type: 'level', db: transition.db, rampMs: transition.rampMs, fromDb: transition.fromDb, state: transition.state });
    if (transition.state === 'resting' || transition.state === 'paused') this.save();
    this.render();
  }

  edit() {
    this.apply(this.model.edit(Date.now()));
  }

  presence() {
    this.model.presence(Date.now());
  }

  tick() {
    this.apply(this.model.tick(Date.now()));
    this.render();
  }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    this.context.globalState.update(LEARNED_KEY, this.model.snapshot());
  }

  // ---- UI ----

  snapshot() {
    const stats = this.model.stats(Date.now());
    return {
      state: this.model.state,
      grace: this.model.graceInfo(),
      stats,
      holdUntil: this.model.holdUntil,
      track: cfg().get('track', 'prelude'),
      volume: cfg().get('volume', 60) / 100,
      softDb: this.model.o.softDb,
      awayMs: this.model.o.restAfterMs,
    };
  }

  render() {
    const s = this.model.state;
    const { icon, word } = STATE_TEXT[s];
    const stats = this.model.stats(Date.now());
    let text = `${icon} ${word}`;
    if (s === 'flow' || s === 'soft') text = `${icon} ${fmtDuration(stats.currentMs)}`;
    if (!this.audioReady) text = '$(unmute) Undercurrent';
    this.status.text = text;

    const g = this.model.graceInfo();
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**Undercurrent** — ${this.audioReady ? word : 'click to let the music in'}\n\n`);
    md.appendMarkdown(`Today in flow: **${fmtDuration(stats.todayMs)}** · longest: ${fmtDuration(stats.longestTodayMs)}\n\n`);
    md.appendMarkdown(
      g.learned
        ? `Softens after **${Math.round(g.ms / 1000)} s** without typing (learned from ${g.samples} of your pauses)\n\n`
        : `Softens after **${Math.round(g.ms / 1000)} s** without typing (learning your rhythm: ${g.samples}/${g.needed})\n\n`
    );
    md.appendMarkdown('Click to play / pause');
    this.status.tooltip = md;
    this.post({ type: 'status', ...this.snapshot() });
  }

  post(msg) {
    if (this.view) this.view.webview.postMessage(msg);
  }

  // ---- webview ----

  resolveWebviewView(view) {
    this.view = view;
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const uri = (...p) => view.webview.asWebviewUri(vscode.Uri.joinPath(media, ...p));
    const nonce = crypto.randomBytes(16).toString('base64');
    const csp = [
      "default-src 'none'",
      `style-src ${view.webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `media-src https: ${view.webview.cspSource}`,
    ].join('; ');

    view.webview.html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${uri('player.css')}">
</head><body>
<main id="app">
  <section class="now">
    <canvas id="ripple" width="160" height="160" aria-hidden="true"></canvas>
    <div class="now-text">
      <div class="state" id="state">Resting</div>
      <div class="sub" id="sub">Start typing. The music will find you.</div>
    </div>
  </section>
  <section class="tracks" id="tracks" role="radiogroup" aria-label="Music"></section>
  <section class="row">
    <button id="toggle" class="btn">Pause</button>
    <button id="hold" class="btn ghost" title="Keep full volume while you read or review">Keep playing 30 min</button>
    <label class="vol">Volume <input id="volume" type="range" min="0" max="100" step="1"></label>
  </section>
  <section class="facts" id="facts"></section>
  <button id="unlock" class="unlock" hidden>Click to let the music in</button>
</main>
<script nonce="${nonce}" src="${uri('engine', 'audio-engine.js')}"></script>
<script nonce="${nonce}" src="${uri('player.js')}"></script>
</body></html>`;

    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    view.onDidDispose(() => {
      this.view = null;
      this.audioReady = false;
      this.render();
    });
  }

  onMessage(msg) {
    switch (msg.type) {
      case 'ready':
        this.post({
          type: 'init',
          ...this.snapshot(),
          tracks: TRACKS,
          customUrl: cfg().get('customStreamUrl', ''),
          db: this.model.level(),
        });
        break;
      case 'audio':
        this.audioReady = !!msg.running;
        this.render();
        break;
      case 'toggle':
        vscode.commands.executeCommand('undercurrent.toggle');
        break;
      case 'hold':
        this.hold(30);
        break;
      case 'setTrack':
        cfg().update('track', msg.id, vscode.ConfigurationTarget.Global);
        break;
      case 'setVolume':
        cfg().update('volume', Math.round(msg.value * 100), vscode.ConfigurationTarget.Global);
        break;
    }
  }

  // ---- commands ----

  toggle() {
    if (!this.view) return this.open();
    if (this.model.state === 'paused' || this.model.state === 'resting') this.apply(this.model.play(Date.now()));
    else this.apply(this.model.pause(Date.now()));
  }

  hold(minutes) {
    this.apply(this.model.hold(minutes * 60_000, Date.now()));
    vscode.window.setStatusBarMessage(`Undercurrent: playing for ${minutes} min`, 3000);
    this.render();
  }

  async open(preserveFocus = false) {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    if (preserveFocus) await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }
}

function activate(context) {
  const player = new Player(context);
  const sub = (d) => context.subscriptions.push(d);

  sub(
    vscode.window.registerWebviewViewProvider(VIEW_ID, player, {
      webviewOptions: { retainContextWhenHidden: true }, // keep playing when the panel is closed
    })
  );

  // Typing: a change to the document you're looking at, while VS Code has focus.
  // Edits from formatters, git, or AI agents in other files don't count.
  sub(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!e.contentChanges.length || !vscode.window.state.focused) return;
      const active = vscode.window.activeTextEditor;
      const isCell = e.document.uri.scheme === 'vscode-notebook-cell';
      if ((active && active.document === e.document) || isCell) player.edit();
    })
  );

  // Reading: moving around counts as presence.
  sub(vscode.window.onDidChangeTextEditorSelection((e) => {
    if (e.kind !== vscode.TextEditorSelectionChangeKind.Command) player.presence();
  }));
  sub(vscode.window.onDidChangeTextEditorVisibleRanges(() => player.presence()));
  sub(vscode.window.onDidChangeActiveTextEditor(() => player.presence()));
  sub(vscode.window.onDidChangeActiveTerminal(() => player.presence()));

  const ticker = setInterval(() => player.tick(), 1000);
  const saver = setInterval(() => player.save(), 60_000);
  sub({ dispose: () => { clearInterval(ticker); clearInterval(saver); player.save(); } });

  sub(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('undercurrent')) return;
      player.model.setOptions(modelOptions());
      player.post({ type: 'config', track: cfg().get('track'), volume: cfg().get('volume') / 100, customUrl: cfg().get('customStreamUrl', '') });
      player.render();
    })
  );

  sub(vscode.commands.registerCommand('undercurrent.toggle', () => player.toggle()));
  sub(vscode.commands.registerCommand('undercurrent.open', () => player.open()));
  sub(
    vscode.commands.registerCommand('undercurrent.chooseTrack', async () => {
      const current = cfg().get('track');
      const pick = await vscode.window.showQuickPick(
        TRACKS.map((t) => ({ ...t, description: t.id === current ? 'playing' : '' })),
        { placeHolder: 'Choose your music' }
      );
      if (pick) cfg().update('track', pick.id, vscode.ConfigurationTarget.Global);
    })
  );
  sub(
    vscode.commands.registerCommand('undercurrent.hold', async () => {
      const pick = await vscode.window.showQuickPick(
        [15, 30, 60, 90].map((m) => ({ label: `${m} minutes`, minutes: m })),
        { placeHolder: 'Keep the music at full volume while you read, review, or think' }
      );
      if (pick) player.hold(pick.minutes);
    })
  );
  sub(vscode.commands.registerCommand('undercurrent.releaseHold', () => { player.model.releaseHold(); player.render(); }));
  sub(
    vscode.commands.registerCommand('undercurrent.resetLearning', () => {
      player.model.resetLearning();
      player.dirty = true;
      player.save();
      player.render();
      vscode.window.showInformationMessage('Undercurrent will relearn your typing rhythm from scratch.');
    })
  );

  if (cfg().get('startOnLaunch', true)) player.open(true);
  welcomeOnFirstRun(context, player);
}

/** First install only: say what to do next, with one button that does it. */
async function welcomeOnFirstRun(context, player) {
  if (context.globalState.get(WELCOMED_KEY)) return;
  await context.globalState.update(WELCOMED_KEY, true);
  const choice = await vscode.window.showInformationMessage(
    'Undercurrent is installed. Open the player, click it once to allow sound, then just start typing.',
    'Open Player'
  );
  if (choice === 'Open Player') player.open();
}

function deactivate() {}

module.exports = { activate, deactivate };
