// Copies the shared engine into the VS Code extension, which must be self-contained to package.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'engine');
const dest = path.join(__dirname, '..', 'vscode', 'media', 'engine');
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (f.endsWith('.js')) fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log('engine synced → vscode/media/engine');
