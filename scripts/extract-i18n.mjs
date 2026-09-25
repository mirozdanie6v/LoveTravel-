import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist');
const names = [
  'index.html','booking-pricing.js','traveler-profile.js','trip-actions.js','trip-policy-live-v2.js',
  'hero-redesign.js','role-switch.js','ai-consultant.js','ai-consultant-v5.js','ai-location-guard-v6.js',
  'ai-catalog-card-v7.js','ai-selection-polish-v15.js','ai-explicit-tour-v16.js','ai-booking-bridge-v25.js',
  'tour-departure-live-v3.js','catalog-show-press.js','tour-lightbox.js','runtime-api.js'
];

const phrases = new Set();
function add(value) {
  const text = String(value || '')
    .replace(/\\n/g, ' ')
    .replace(/\\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[А-Яа-яЁё]/.test(text)) return;
  if (text.length < 2 || text.length > 220) return;
  if (/[<>{}$]/.test(text)) return;
  if (/^(?:const|let|var|return|function|if|else|new|window|globalThis|document)\b/.test(text)) return;
  if (/\\[dwsb]|\(\?:|\[\^|\.replace\(|\.map\(|\.filter\(/.test(text)) return;
  phrases.add(text);
}

for (const name of names) {
  let source = '';
  try { source = await readFile(resolve(root, name), 'utf8'); } catch { continue; }
  for (const match of source.matchAll(/>([^<>\n]{0,220}[А-Яа-яЁё][^<>\n]{0,220})</g)) add(match[1]);
  for (const match of source.matchAll(/(['"`])([^'"`\n]{0,220}[А-Яа-яЁё][^'"`\n]{0,220})\1/g)) add(match[2]);
}
const list = [...phrases].sort((a,b) => a.localeCompare(b, 'ru'));
process.stdout.write(JSON.stringify(list, null, 2));
