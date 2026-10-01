import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { styles, figures } from './diagrams.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const names = { aggressive: 'personality-aggressive-balanced', cautious: 'personality-cautious-balanced', objective: 'personality-objective-balanced-final' };
const models = Object.fromEntries(Object.entries(names).map(([name, dir]) => {
  const path = `training/runs/${dir}/policy.json`;
  const raw = readFileSync(resolve(root, path));
  return [name, { policy: JSON.parse(raw), path, sha256: createHash('sha256').update(raw).digest('hex'), evaluation: JSON.parse(readFileSync(resolve(root, `training/runs/${dir}/independent-evaluation-final.json`), 'utf8')) }];
}));
let template = readFileSync(resolve(here, 'course.template.html'), 'utf8');
const selection = JSON.parse(readFileSync(resolve(root, 'training/runs/balance-20261001/selection.json'), 'utf8'));
template = template.replace('</style>', `${styles}</style>`);
for (const [lesson, figure] of Object.entries(figures(selection))) {
  const anchor = new RegExp(`(<section class="module" id="${lesson}">[\\s\\S]*?<p class="objective">[\\s\\S]*?</p>)`);
  if (!anchor.test(template)) throw new Error(`Missing lesson ${lesson}`);
  template = template.replace(anchor, (intro) => intro + figure);
}
const js = readFileSync(resolve(here, 'course.js'), 'utf8');
const data = JSON.stringify(models).replaceAll('<', '\\u003c');
writeFileSync(resolve(here, 'index.html'), template.replace('/* MODELS */', `const MODELS = ${data};`).replace('/* COURSE_SCRIPT */', js));
console.log('Built portable academy/index.html with three actual model snapshots.');
