'use strict';
/* Build the self-contained emulator. Reads the app's own modules (the single
 * source of truth) + the canvas shim as TEXT, wraps each in a tiny CommonJS
 * module shim, and inlines them together with the HMI chrome, control panel,
 * a <canvas> and the render loop into one index.html with no external URLs. */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const APP = path.join(DIR, '..', 'apps', 'base_player');

function read(p) { return fs.readFileSync(p, 'utf8'); }

const canvasSrc = read(path.join(DIR, 'canvas.js'));
const i18nSrc = read(path.join(APP, 'i18n.js'));
const viewSrc = read(path.join(APP, 'view.js'));
const fixturesSrc = read(path.join(DIR, 'fixtures.js'));
const appJson = JSON.parse(read(path.join(APP, 'app.json')));
const buttons = appJson.screens[0].buttons; // [[id,label],...]

// id -> i18n key so the button bar follows the language toggle
const BTN_KEYS = {
    BTN_START: 'btn_start', BTN_END_VIDEO: 'btn_end_video',
    BTN_MIRROR: 'btn_mirror', BTN_STOP: 'btn_stop', BTN_CLOSE: 'btn_close', BTN_SETTINGS: 'btn_settings',
};

// Map a scene phase to a hardware button id, so clicking a button can jump to a
// representative scene (nice-to-have; purely a preview convenience).
const buttonsJSON = JSON.stringify(
    buttons.map(b => ({ id: b[0], label: b[1], key: BTN_KEYS[b[0]] || null }))
);

function mod(name, src) {
    // Inline the raw module body verbatim inside a CommonJS wrapper so the file
    // reads naturally and greps cleanly. (No source here contains </script>.)
    return `__def(${JSON.stringify(name)}, function(module, exports, require){\n${src}\n});\n`;
}

const registry =
    mod('canvas', canvasSrc) +
    mod('i18n', i18nSrc) +
    // The real brand_logo.js inflates a baked image with zlib; the emulator
    // draws a stand-in mark instead (canvas.js image()).
    mod('brand_logo', "module.exports = { ID: 0x42500001, pixels: null, register: function(){} };") +
    mod('view', viewSrc) +
    mod('fixtures', fixturesSrc);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>BMW iDrive 7 — Base Player emulator</title>
<style>
  :root { --chrome: #05070b; --chrome2: #0a0e14; --ink: #e8edf3; --muted: #8c9bb0; --line: #141b26; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; padding: 0; background: #000; color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif; }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 18px 14px 40px; }
  .frame { background: #000; border-radius: 16px; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,.6), 0 0 0 1px #11161f inset; }

  /* top status bar */
  .statusbar { display: flex; align-items: center; justify-content: space-between;
    background: linear-gradient(#0a0e14, #05070b); border-bottom: 1px solid var(--line);
    padding: 6px 18px; height: 34px; }
  .statusbar .clock { font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
    font-size: 15px; letter-spacing: .5px; color: #cdd6e2; }
  .statusbar .right { display: flex; align-items: center; gap: 12px; }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 14px; }
  .bars i { width: 3px; background: #6f8095; border-radius: 1px; display: block; }
  .bars i.on { background: #cdd6e2; }
  .spk { width: 16px; height: 16px; display: block; opacity: .85; }

  /* canvas body */
  .body { display: block; width: 100%; background: #06090e; }
  canvas { display: block; width: 100%; height: auto; }

  /* hardware button bar */
  .btnbar { display: flex; background: linear-gradient(#05070b, #0a0e14);
    border-top: 1px solid var(--line); }
  .btnbar button { flex: 1 1 0; background: transparent; border: 0;
    border-right: 1px solid var(--line); color: #b7c3d4; font-size: 13px;
    letter-spacing: .6px; text-transform: uppercase; padding: 13px 6px; cursor: pointer;
    font-family: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btnbar button:last-child { border-right: 0; }
  .btnbar button:hover { color: #fff; background: rgba(47,155,255,.08); }
  .btnbar button:active { background: rgba(47,155,255,.16); }

  /* control panel */
  .panel { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
    margin-top: 16px; padding: 14px 16px; background: #0b1017; border: 1px solid var(--line);
    border-radius: 12px; }
  .panel .grp { display: flex; align-items: center; gap: 8px; }
  .panel label { font-size: 12px; color: var(--muted); text-transform: uppercase;
    letter-spacing: .5px; }
  .panel button, .panel select { font-family: inherit; font-size: 13px; color: var(--ink);
    background: #151d29; border: 1px solid #263448; border-radius: 8px; padding: 7px 12px;
    cursor: pointer; }
  .panel button:hover { border-color: #2f9bff; }
  .panel button.active { background: #12325a; border-color: #2f9bff; color: #cfe6ff; }
  .panel select { min-width: 190px; }
  .panel .sep { width: 1px; align-self: stretch; background: var(--line); }
  .scene-name { font-size: 12px; color: var(--muted); margin-left: auto; }
</style>
</head>
<body>
<div class="wrap">
  <div class="frame">
    <div class="statusbar">
      <span class="clock" id="clock">00:00</span>
      <span class="right">
        <span class="bars" id="bars"></span>
        <svg class="spk" viewBox="0 0 24 24" fill="none" stroke="#cdd6e2" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a3 3 0 010 6"/><path d="M18.5 7a6 6 0 010 10"/>
        </svg>
      </span>
    </div>
    <div class="body"><canvas id="screen"></canvas></div>
    <div class="btnbar" id="btnbar"></div>
  </div>

  <div class="panel">
    <div class="grp">
      <label>Scene</label>
      <button id="prev" title="Previous scene">‹</button>
      <select id="scenes"></select>
      <button id="next" title="Next scene">›</button>
    </div>
    <div class="sep"></div>
    <div class="grp">
      <label>Lang</label>
      <button id="lang-en" class="active">EN</button>
      <button id="lang-uk">UK</button>
    </div>
    <div class="sep"></div>
    <div class="grp">
      <label>Screen</label>
      <button id="h-520" class="active">520</button>
      <button id="h-416">416</button>
    </div>
    <span class="scene-name" id="scene-name"></span>
  </div>
</div>

<script>
/* ---- CommonJS module registry (inlined app + shim source) ---- */
var __modules = {};
function __def(name, fn){ __modules[name] = { fn: fn, mod: null }; }
function __require(id){
  var name = String(id).replace(/^\\.\\//, '').replace(/\\.js$/, '');
  var rec = __modules[name];
  if(!rec) throw new Error('module not found: ' + id);
  if(!rec.mod){ rec.mod = { exports: {} }; rec.fn(rec.mod, rec.mod.exports, __require); }
  return rec.mod.exports;
}

${registry}
/* ---- harness ---- */
(function(){
  var makeCanvas = __require('./canvas').makeCanvas;
  var i18n = __require('./i18n');
  var t = i18n.t;
  var drawHome = __require('./view').drawHome;
  var fixtures = __require('./fixtures');
  var BUTTONS = ${buttonsJSON};

  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d');
  var H = 520;          // canvas body logical height (520 or 416)
  var idx = 0;          // current scene
  var lang = 'en';
  var curTargets = [];

  /* --- layout: crisp scaling, shim draws in 1600xH logical units --- */
  function layout(){
    var cssW = canvas.parentNode.clientWidth || 960;
    var dpr = window.devicePixelRatio || 1;
    var scale = cssW / 1600;
    canvas.style.height = (cssW * H / 1600) + 'px';
    canvas.width = Math.max(1, Math.round(1600 * scale * dpr));
    canvas.height = Math.max(1, Math.round(H * scale * dpr));
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    render();
  }

  function render(){
    t.set(lang);
    var c = makeCanvas(ctx, 1600, H);
    var scene = fixtures[idx] || fixtures[0];
    try { drawHome(c, scene.state || {}, scene.notice || '', null, null, function(){}); }
    catch(e){ console.error('drawHome threw', e); }
    curTargets = c._targets || [];
    document.getElementById('scene-name').textContent = scene.name || '';
    renderButtons();
  }

  /* --- hardware button bar (static preview; follows language) --- */
  function renderButtons(){
    var bar = document.getElementById('btnbar');
    bar.innerHTML = '';
    BUTTONS.forEach(function(b){
      var el = document.createElement('button');
      el.textContent = b.key ? t(b.key) : b.label;
      el.title = b.id;
      bar.appendChild(el);
    });
  }

  /* --- canvas click -> logical coords -> hit targets --- */
  canvas.addEventListener('click', function(ev){
    var r = canvas.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width * 1600;
    var y = (ev.clientY - r.top) / r.height * H;
    for (var i = curTargets.length - 1; i >= 0; i--){
      var tg = curTargets[i];
      if (x >= tg.x && x <= tg.x + tg.w && y >= tg.y && y <= tg.y + tg.h){
        if (typeof tg.onClick === 'function'){ try { tg.onClick(); } catch(e){} }
        break;
      }
    }
  });

  /* --- scene picker --- */
  var sel = document.getElementById('scenes');
  fixtures.forEach(function(f, i){
    var o = document.createElement('option');
    o.value = i; o.textContent = (i+1) + '. ' + f.name;
    sel.appendChild(o);
  });
  function setScene(i){
    idx = (i + fixtures.length) % fixtures.length;
    sel.value = idx;
    render();
  }
  document.getElementById('prev').onclick = function(){ setScene(idx - 1); };
  document.getElementById('next').onclick = function(){ setScene(idx + 1); };
  sel.onchange = function(){ setScene(parseInt(sel.value, 10) || 0); };

  /* --- language toggle --- */
  function setLang(l){
    lang = l;
    document.getElementById('lang-uk').classList.toggle('active', l === 'uk');
    document.getElementById('lang-en').classList.toggle('active', l === 'en');
    render();
  }
  document.getElementById('lang-uk').onclick = function(){ setLang('uk'); };
  document.getElementById('lang-en').onclick = function(){ setLang('en'); };

  /* --- short-screen toggle --- */
  function setH(h){
    H = h;
    document.getElementById('h-520').classList.toggle('active', h === 520);
    document.getElementById('h-416').classList.toggle('active', h === 416);
    layout();
  }
  document.getElementById('h-520').onclick = function(){ setH(520); };
  document.getElementById('h-416').onclick = function(){ setH(416); };

  /* --- status bar clock + signal bars --- */
  var barsEl = document.getElementById('bars');
  var heights = [5, 8, 11, 14];
  heights.forEach(function(h, i){
    var b = document.createElement('i');
    b.style.height = h + 'px';
    if (i < 3) b.className = 'on';
    barsEl.appendChild(b);
  });
  function tick(){
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    document.getElementById('clock').textContent = hh + ':' + mm;
  }
  tick(); setInterval(tick, 1000 * 15);

  window.addEventListener('resize', layout);
  layout();
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, 'index.html'), html, 'utf8');
console.log('wrote', path.join(DIR, 'index.html'), '(' + html.length + ' bytes)');
