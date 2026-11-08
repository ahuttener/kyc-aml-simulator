// Builds dist/index.html: a single self-contained file with the scripts inlined.
const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
for (const f of ['src/engine.js', 'src/app.js']) {
  const js = fs.readFileSync(f, 'utf8').replace(/<\/script>/g, '<\\/script>');
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${js}\n</script>`);
}
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log('dist/index.html', html.length, 'bytes');
