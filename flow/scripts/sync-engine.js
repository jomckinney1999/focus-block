// Copies the shared engine into each extension, which must be self-contained to package.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'engine');
for (const target of [['vscode', 'media', 'engine'], ['chrome', 'engine']]) {
  const dest = path.join(__dirname, '..', ...target);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (f.endsWith('.js')) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  console.log('engine synced → ' + target.join('/'));
}
