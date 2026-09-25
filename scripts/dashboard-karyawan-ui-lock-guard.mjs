#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../dashboard-karyawan-ui-locks.json', import.meta.url), 'utf8'));
const base = process.argv[2] || process.env.VAX_UI_LOCK_BASE || 'HEAD~1';
const head = process.argv[3] || process.env.VAX_UI_LOCK_HEAD || 'HEAD';

const commitMessage = execFileSync('git', ['log','-1','--pretty=%B', head], {encoding:'utf8'});
const unlocked = new Set([...commitMessage.matchAll(/UI-UNLOCK=([a-z0-9_-]+)/gi)].map(m => m[1].toLowerCase()));
const changedFiles = execFileSync('git', ['diff','--name-only', base, head], {encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
const failures = [];

for (const [component, rule] of Object.entries(manifest.components)) {
  if (unlocked.has(component.toLowerCase())) continue;
  for (const file of (rule.dedicated_files || [])) {
    if (changedFiles.includes(file)) failures.push(component + ': dedicated locked file changed: ' + file);
  }
  for (const [file, patterns] of Object.entries(rule.shared_rules || {})) {
    if (!changedFiles.includes(file)) continue;
    let diff = '';
    try { diff = execFileSync('git', ['diff','-U0', base, head, '--', file], {encoding:'utf8'}); } catch {}
    const lower = diff.toLowerCase();
    const touched = patterns.filter(p => lower.includes(String(p).toLowerCase()));
    if (touched.length) failures.push(component + ': locked selectors/tokens touched in ' + file + ': ' + touched.join(', '));
  }
}

if (failures.length) {
  console.error('\nVAX Dashboard Karyawan UI LOCK GUARD: BLOCKED\n');
  for (const failure of failures) console.error(' - ' + failure);
  console.error('\nExplicit Owner-approved edits must use commit token: UI-UNLOCK=<component>');
  process.exit(1);
}
console.log('VAX Dashboard Karyawan UI LOCK GUARD: PASS');
