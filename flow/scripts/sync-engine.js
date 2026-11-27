// Copies the shared engine (and the extension downloads) into each place that needs its own copy:
// the two extensions must be self-contained to package, and the Next.js site serves its own files.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function copyDir(src, dest, filter) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (filter(f)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
}

const js = (f) => f.endsWith('.js');
for (const target of [['vscode', 'media', 'engine'], ['chrome', 'engine'], ['site', 'lib', 'engine']]) {
  copyDir(path.join(root, 'engine'), path.join(root, ...target), js);
  console.log('engine synced → ' + target.join('/'));
}
copyDir(path.join(root, 'download'), path.join(root, 'site', 'public', 'download'), () => true);
console.log('downloads synced → site/public/download');
