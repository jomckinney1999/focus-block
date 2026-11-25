'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('VS Code extension carries the same engine as the web app (run `npm run sync` if this fails)', () => {
  const src = path.join(__dirname, '..', 'engine');
  const dest = path.join(__dirname, '..', 'vscode', 'media', 'engine');
  for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.js'))) {
    assert.equal(fs.readFileSync(path.join(dest, f), 'utf8'), fs.readFileSync(path.join(src, f), 'utf8'), f);
  }
});
