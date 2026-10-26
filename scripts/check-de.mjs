// Development only: exercises the German home screen against a fake Tizen API in a browser.
// It checks our own logic (app resolution, Fernsehen flow). It does not prove TV behaviour.
import { openPreview } from './browser.mjs';
import assert from 'node:assert/strict';

const fakeTizen = () => {
  const calls = window.__calls = [];
  const apps = [
    { id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: true, iconPath: '' },
    { id: 'org.tizen.primevideo', name: 'Prime Video', show: true, iconPath: '' },
    { id: 'Abcdefghij.DAZNTizen', name: 'DAZN', show: true, iconPath: '' },
    { id: 'Klmnopqrst.SkyWOW', name: 'WOW', show: true, iconPath: '' },
    { id: 'MCmYXNxgcu.DisneyPlus', name: 'Disney+', show: true, iconPath: '' },
    { id: 'Zyxwvutsrq.ARDMediathek', name: 'ARD Mediathek', show: true, iconPath: '' },
    { id: 'JschHome01.Startseite', name: 'Startseite', show: true, iconPath: '' }
  ];
  window.tizen = {
    application: {
      getAppsInfo: ok => setTimeout(() => ok(apps), 10),
      launch: (id, ok) => { calls.push('launch:' + id); setTimeout(ok, 10); }
    },
    systeminfo: {
      getPropertyValue: (name, ok) => setTimeout(() => ok({ connected: [{ type: 'TV', number: 1 }, { type: 'HDMI', number: 2 }] }), 10)
    },
    tvwindow: {
      setSource: (src, ok) => { calls.push('source:' + src.type + src.number); setTimeout(ok, 10); },
      show: (ok, err, rect, type) => { calls.push('show:' + rect.join(',') + ':' + type); setTimeout(ok, 10); },
      hide: ok => { calls.push('hide'); setTimeout(ok, 10); }
    }
  };
};

const preview = await openPreview({ publicFonts: true });
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(fakeTizen);
  await page.goto(preview.baseURL + '/home/');
  await page.waitForFunction(() => window.ShoreQA.state().catalog.loaded);
  await page.focus('#stage');

  let state = await page.evaluate(() => window.ShoreQA.state());
  assert.deepEqual(state.committed.home, ['tv', 'youtube', 'primevideo', 'dazn', 'wow', 'disneyplus'], 'default order');
  assert.equal(state.committed.layout, 'list', 'list layout by default');
  assert.equal(state.selected, 'tv', 'Fernsehen is selected first');
  assert.ok(!state.catalog.ids.includes('JschHome01.Startseite'), 'launcher hides itself');

  // DAZN and WOW resolve to the TV's regional IDs.
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  let calls = await page.evaluate(() => window.__calls.slice());
  assert.deepEqual(calls, ['launch:Abcdefghij.DAZNTizen', 'launch:Klmnopqrst.SkyWOW'], 'DAZN and WOW launch by resolved ID');

  // Fernsehen switches to HDMI full screen and hides the launcher; Back brings the list back.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  calls = await page.evaluate(() => window.__calls.slice(2));
  assert.deepEqual(calls, ['source:HDMI2', 'show:0px,0px,100%,100%:MAIN'], 'HDMI shown full screen');
  assert.ok(await page.evaluate(() => document.getElementById('stage').classList.contains('is-watching')), 'launcher hidden while watching');
  await page.keyboard.press('ArrowDown'); // ignored while watching
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert.ok(!(await page.evaluate(() => document.getElementById('stage').classList.contains('is-watching'))), 'Back shows the list again');
  calls = await page.evaluate(() => window.__calls.slice(4));
  assert.deepEqual(calls, ['hide'], 'TV window hidden on Back');
  state = await page.evaluate(() => window.ShoreQA.state());
  assert.equal(state.selected, 'tv', 'arrow presses while watching did not move the list');

  // Relaunch via the Home button (appcontrol event) also leaves the TV picture.
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event('appcontrol')));
  await page.waitForTimeout(100);
  assert.ok(!(await page.evaluate(() => document.getElementById('stage').classList.contains('is-watching'))), 'appcontrol shows the list');

  // Home control "Samsung-Menü" opens Samsung's own Home.
  await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  calls = await page.evaluate(() => window.__calls);
  assert.equal(calls[calls.length - 1], 'launch:com.samsung.tv.csfs', 'Samsung-Menü opens Samsung Home');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('German home screen checks passed.');
} finally { await preview.close(); }
