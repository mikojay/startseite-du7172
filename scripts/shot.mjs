// Development only: capture preview screenshots. Usage: node scripts/shot.mjs out-prefix [keys...]
// Keys are applied in order; a "|" key takes a screenshot at that point.
import { openPreview } from './browser.mjs';
const [prefix = 'shot', ...keys] = process.argv.slice(2);
const preview = await openPreview({ publicFonts: true });
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(preview.baseURL + '/home/');
  await page.waitForTimeout(1500);
  await page.focus('#stage');
  let n = 0;
  const snap = async () => { await page.waitForTimeout(700); await page.screenshot({ path: `${prefix}-${n++}.png` }); };
  const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ok: 'Enter', back: 'Escape' };
  for (const k of keys) {
    if (k === '|') await snap();
    else { await page.keyboard.press(map[k] || k); await page.waitForTimeout(250); }
  }
  await snap();
  if (errors.length) console.log('Page errors:\n' + errors.join('\n'));
  console.log('Saved ' + n + ' screenshot(s) to ' + prefix + '-*.png');
} finally { await preview.close(); }
