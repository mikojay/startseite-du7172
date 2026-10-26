/* Public Tizen application and TV-window APIs. No server, network address or credentials. */
(function () {
  'use strict';
  /* Known Samsung app IDs. DAZN and WOW are resolved by name from the TV's installed apps,
     because their IDs are regional; NAMES also catches regional variants of the others. */
  var IDS = {
    youtube: '9Ur5IzDKqV.TizenYouTube', primevideo: 'org.tizen.primevideo',
    disneyplus: 'MCmYXNxgcu.DisneyPlus', netflix: 'org.tizen.netflix-app'
  };
  var NAMES = {
    youtube: /^youtube$/i, primevideo: /^(?:amazon )?prime ?video$/i, disneyplus: /^disney ?\+|^disney plus/i,
    dazn: /^dazn\b/i, wow: /^wow\b/i, netflix: /^netflix$/i
  };
  var BRANDS = ['youtube', 'primevideo', 'dazn', 'wow', 'disneyplus', 'netflix'];
  var CONSUMER_SYSTEM = ['org.tizen.browser'];
  var INTERNAL = ['adplatform.ADPlayer', 'WykOS4t4F0.cmsWebApp', '25emanual3.emanual',
    'ZODRT12q2l.WebAccountExtension', 'ByJlgt0XeD.CastSettingsApp', 'tv6pbVMQFF.PrivacyChoices'];
  /* Must match app/config.xml. */
  var SELF = 'JschHome01.Startseite';
  /* HDMI input of the Vodafone box. 0 = the first connected HDMI input. Set on the TV once known. */
  var TV_HDMI = 0;

  function api() { return window.tizen && window.tizen.application; }
  function unavailable(done) {
    done({ message: 'Das funktioniert nur auf dem Fernseher.', detail: 'Die Vorschau im Browser kann den Fernseher nicht steuern.' });
  }
  function failure(err) {
    return { message: 'Der Fernseher konnte das nicht öffnen.', detail: err && (err.message || err.name) || 'Nochmal versuchen oder die Home-Taste der Fernbedienung drücken.' };
  }
  function bounded(done) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'Der Fernseher hat nicht reagiert. Bitte nochmal versuchen.' }); }, 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function launchApp(id, done) {
    if (!api()) { unavailable(done); return; }
    if (!id || id.indexOf('.') < 0) { done({ message: 'Diese App ist nicht installiert.', detail: 'Bitte im Samsung-Menü unter Apps installieren und hier erneut öffnen.' }); return; }
    var finish = bounded(done);
    try { api().launch(id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
    catch (err) { finish(failure(err)); }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({ message: 'Diese App kann nicht gestartet werden.' }); return; }
    launchApp(IDS[brand], done);
  }

  /* ---------- Fernsehen: show the Vodafone box's HDMI input full screen ---------- */
  var watching = false;
  function hasTvWindow() { return !!(window.tizen && window.tizen.tvwindow && window.tizen.systeminfo); }
  function tv(done) {
    if (!hasTvWindow()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      window.tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        var list = info && info.connected || [], source = null, i;
        for (i = 0; i < list.length; i++) {
          if (list[i].type === 'HDMI' && (!TV_HDMI || list[i].number === TV_HDMI)) { source = list[i]; break; }
        }
        if (!source) { finish({ message: 'Die Vodafone-Box wurde nicht gefunden.', detail: 'Ist sie eingeschaltet und per HDMI-Kabel verbunden?' }); return; }
        window.tizen.tvwindow.setSource(source, function () {
          window.tizen.tvwindow.show(function () { watching = true; finish(null); }, function (err) { finish(failure(err)); },
            ['0px', '0px', '100%', '100%'], 'MAIN');
        }, function (err) { finish(failure(err)); }, 'MAIN');
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function tvHide(done) {
    done = done || function () {};
    if (!hasTvWindow() || !watching) { watching = false; done(null); return; }
    watching = false;
    try { window.tizen.tvwindow.hide(function () { done(null); }, function (err) { done(failure(err)); }, 'MAIN'); }
    catch (err) { done(failure(err)); }
  }

  /* "Samsung-Menü": explicitly launch Samsung's original Home app. After native Home
     reassignment, exit() returns to the launcher itself, so launch the real Home app.
     com.samsung.tv.csfs is this TV's original Home app; com.samsung.tv.coba.newhome is not. */
  function home(done) {
    tvHide();
    launchApp('com.samsung.tv.csfs', done);
  }
  function settings(done) { tvHide(); launchApp('com.samsung.tv.coba.setting', done); }
  function brandOf(a) {
    var i, b;
    for (i = 0; i < BRANDS.length; i++) { b = BRANDS[i]; if (IDS[b] === a.id) return b; }
    for (i = 0; i < BRANDS.length; i++) { b = BRANDS[i]; if (NAMES[b].test(String(a.name || '').trim())) return b; }
    return '';
  }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().getAppsInfo(function (list) {
        var seen = {}, taken = {}, result = [];
        list.forEach(function (a) {
          var brand = brandOf(a), primary = !!brand && !taken[brand];
          var consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER_SYSTEM.indexOf(a.id) >= 0;
          if (a.id === SELF || INTERNAL.indexOf(a.id) >= 0 || seen[a.id] || !a.name || (!primary && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|test|sdk|^ep[ -]|factory|daemon)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          if (primary) taken[brand] = true;
          result.push({ appId: a.id, name: a.name, brand: primary ? brand : '', icon: a.iconPath || '', rank: primary ? BRANDS.indexOf(brand) : 30 });
        });
        result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        finish(null, result);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  window.FrameDevice = { launch: launch, launchApp: launchApp, tv: tv, tvHide: tvHide, isWatching: function () { return watching; },
    home: home, settings: settings, apps: apps, onTv: !!api() };
}());
