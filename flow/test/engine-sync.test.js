'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

for (const target of [['vscode', 'media', 'engine'], ['chrome', 'engine'], ['site', 'lib', 'engine']]) {
  test(`${target[0]} extension carries the same engine as the web app (run \`npm run sync\` if this fails)`, () => {
    const src = path.join(__dirname, '..', 'engine');
    const dest = path.join(__dirname, '..', ...target);
    for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.js'))) {
      assert.equal(fs.readFileSync(path.join(dest, f), 'utf8'), fs.readFileSync(path.join(src, f), 'utf8'), f);
    }
  });
}

test('site serves the current extension downloads (run `npm run sync` if this fails)', () => {
  const src = path.join(__dirname, '..', 'download');
  const dest = path.join(__dirname, '..', 'site', 'public', 'download');
  for (const f of fs.readdirSync(src)) {
    assert.ok(fs.readFileSync(path.join(dest, f)).equals(fs.readFileSync(path.join(src, f))), f);
  }
});
