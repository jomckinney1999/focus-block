'use strict';
// Loads the extension against a minimal fake `vscode` module and checks that
// typing in the active editor sends level changes to the player webview.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

function fakeVscode() {
  const handlers = {};
  const on = (name) => (fn) => { handlers[name] = fn; return { dispose() {} }; };
  const commands = {};
  const config = { track: 'prelude', volume: 60, softenAfterSeconds: 0, softLevelDb: -9, awayAfterMinutes: 5, startOnLaunch: false, customStreamUrl: '' };
  const doc = { uri: { scheme: 'file' } };
  const vscode = {
    handlers, commands, doc,
    StatusBarAlignment: { Right: 2 },
    TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2, Command: 3 },
    ConfigurationTarget: { Global: 1 },
    Uri: { joinPath: (...p) => p.join('/') },
    MarkdownString: class { constructor() { this.value = ''; } appendMarkdown(s) { this.value += s; } },
    window: {
      state: { focused: true },
      activeTextEditor: { document: doc },
      createStatusBarItem: () => ({ show() {}, text: '', tooltip: '' }),
      registerWebviewViewProvider: (id, provider) => { vscode.provider = provider; return { dispose() {} }; },
      onDidChangeTextEditorSelection: on('selection'),
      onDidChangeTextEditorVisibleRanges: on('visible'),
      onDidChangeActiveTextEditor: on('activeEditor'),
      onDidChangeActiveTerminal: on('terminal'),
      setStatusBarMessage() {},
      showQuickPick: async () => undefined,
      showInformationMessage() {},
    },
    workspace: {
      onDidChangeTextDocument: on('change'),
      onDidChangeConfiguration: on('config'),
      getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d), update: async (k, v) => { config[k] = v; } }),
    },
    commands: {
      registerCommand: (id, fn) => { commands[id] = fn; return { dispose() {} }; },
      executeCommand: async () => {},
    },
  };
  return vscode;
}

test('typing in the active editor wakes the music; other files do not', () => {
  const vscode = fakeVscode();
  const origLoad = Module._load;
  Module._load = function (req, ...rest) { return req === 'vscode' ? vscode : origLoad.call(this, req, ...rest); };
  const ext = require(path.join(__dirname, '..', 'vscode', 'extension.js'));
  Module._load = origLoad;

  const store = new Map();
  const context = { subscriptions: [], extensionUri: 'ext', globalState: { get: (k) => store.get(k), update: async (k, v) => store.set(k, v) } };
  ext.activate(context);

  const posted = [];
  const webview = { options: null, html: '', cspSource: 'vscode-resource:', asWebviewUri: (u) => u, postMessage: (m) => posted.push(m), onDidReceiveMessage() {} };
  vscode.provider.resolveWebviewView({ webview, onDidDispose() {} });
  assert.match(webview.html, /Content-Security-Policy/);

  const otherDoc = { uri: { scheme: 'file' } };
  for (let i = 0; i < 5; i++) vscode.handlers.change({ document: otherDoc, contentChanges: [{}] });
  assert.equal(posted.filter((m) => m.type === 'level').length, 0, 'edits to background files are ignored');

  for (let i = 0; i < 3; i++) vscode.handlers.change({ document: vscode.doc, contentChanges: [{}] });
  const levels = posted.filter((m) => m.type === 'level');
  assert.equal(levels.length, 1);
  assert.equal(levels[0].state, 'flow');
  assert.equal(levels[0].db, 0);

  context.subscriptions.forEach((d) => d.dispose && d.dispose());
});
