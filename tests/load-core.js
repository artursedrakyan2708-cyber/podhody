// Достаёт блок <script id="core"> из index.html и выполняет его отдельно от страницы.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function inlineScripts() {
  const out = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\ssrc=/.test(attrs)) continue;
    out.push({ attrs, code: m[2] });
  }
  return out;
}

function loadCore() {
  const core = inlineScripts().find((s) => /id="core"/.test(s.attrs));
  if (!core) throw new Error('В index.html нет <script id="core">');
  // Тот же контекст, что у тестов, чтобы deepEqual сравнивал объекты одного «мира».
  const mod = { exports: {} };
  vm.runInThisContext('(function (module) {' + core.code + '\n})', { filename: 'index.html#core' })(mod);
  return mod.exports;
}

module.exports = { html, inlineScripts, loadCore };
