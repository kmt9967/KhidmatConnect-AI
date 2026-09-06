/**
 * PART 8 - real-browser mobile / desktop / RTL verification.
 *
 * Drives a headless Chrome through the DevTools Protocol using only Node
 * built-ins (global WebSocket + fetch), so nothing is added to package.json.
 * It is the only way to check the two things this task actually hinges on:
 *
 *  1. GEOMETRY at the demo viewport sizes (390x844, 412x915) and at desktop
 *     (1440x900): horizontal overflow, hero breathing room, tap-target sizes.
 *  2. A REAL BLOCKED PERMISSION. Browser.setPermission reproduces the exact
 *     content setting that caused the incident, so "a blocked origin makes
 *     zero navigator.geolocation calls" is measured in Chrome, not asserted
 *     from a mock.
 *
 * Run: node scripts/viewport-verify.mjs   (needs `npm run start` on VERIFY_BASE)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.VERIFY_BASE || 'http://localhost:3111';
const CDP_PORT = Number(process.env.CDP_PORT || 9333);
const OUT = process.env.VERIFY_OUT || path.join(os.tmpdir(), 'kc-viewport-verify');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const screenshots = [];
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${name}${detail ? `   [${detail}]` : ''}`);
}
function section(t) {
  console.log(`\n\u2500\u2500 ${t} \u2500\u2500`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shotPath = (n) => path.join(OUT, `${n}.png`);

// ─── CDP plumbing ──────────────────────────────────────────
let ws;
let msgId = 0;
const pending = new Map();

function cdp(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
/** Unwraps the CDP envelope: resolves with `result`, rejects on `error`. */
function settle(m) {
  const w = pending.get(m.id);
  if (!w) return;
  pending.delete(m.id);
  if (m.error) w.reject(new Error(`${m.error.code} ${m.error.message} [${w.method}]`));
  else w.resolve(m.result);
}
async function cdpFetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-chrome-profile-'));
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) console.log(`chrome exited code=${code}`);
  });
  return proc;
}

async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const info = await cdpFetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

// ─── page helpers ──────────────────────────────────────────
const SPY = `(() => {
  const w = window;
  w.__geo = { getCurrentPosition: 0, watchPosition: 0, clearWatch: 0, permissionsQuery: 0, active: 0, maxActive: 0, watchOptions: null, fixes: 0, errors: [], log: [] };
  const mark = (m) => w.__geo.log.push({ m, t: Math.round(performance.now()) });
  const g = navigator.geolocation;
  if (g) {
    const _gcp = g.getCurrentPosition.bind(g);
    const _watch = g.watchPosition.bind(g);
    const _clear = g.clearWatch.bind(g);
    g.getCurrentPosition = function (s, e, o) { w.__geo.getCurrentPosition += 1; mark('getCurrentPosition'); return _gcp(s, e, o); };
    g.watchPosition = function (s, e, o) {
      w.__geo.watchPosition += 1;
      w.__geo.active += 1;
      w.__geo.maxActive = Math.max(w.__geo.maxActive, w.__geo.active);
      // What actually reached the browser matters: a watch carrying a timeout
      // tears itself down whenever the device stops producing fresh fixes.
      w.__geo.watchOptions = { timeout: o && o.timeout, maximumAge: o && o.maximumAge, enableHighAccuracy: o && o.enableHighAccuracy };
      mark('watchPosition');
      return _watch(
        (p) => { w.__geo.fixes += 1; mark('watch:fix'); return s(p); },
        (err) => { w.__geo.errors.push(err && err.code); mark('watch:error#' + (err && err.code)); return e && e(err); },
        o,
      );
    };
    g.clearWatch = function (id) { w.__geo.clearWatch += 1; w.__geo.active = Math.max(0, w.__geo.active - 1); mark('clearWatch'); return _clear(id); };
  }
  if (navigator.permissions && navigator.permissions.query) {
    const _q = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function (d) {
      w.__geo.permissionsQuery += 1;
      mark('permissions.query:' + (d && d.name));
      return _q(d);
    };
  }
})()`;

async function ev(expression, sessionId) {
  const r = await cdp(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate threw',
    );
  }
  return r.result.value;
}

const GEO_COUNTERS = `JSON.parse(JSON.stringify(window.__geo || {}))`;

const LAYOUT = `(() => {
  const de = document.documentElement;
  const iw = window.innerWidth;
  const offenders = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > iw + 1 && getComputedStyle(el).position !== 'fixed';
    })
    .slice(0, 5)
    .map((el) => el.tagName + '.' + String(el.className).slice(0, 46));
  return {
    iw,
    ih: window.innerHeight,
    sw: de.scrollWidth,
    overflow: de.scrollWidth > iw + 1,
    offenders,
    secure: window.isSecureContext,
    scrollableY: de.scrollHeight > de.clientHeight,
  };
})()`;

const SPLASH_PROBE = `(() => {
  const el = [...document.querySelectorAll('body *')].find((d) => {
    const s = getComputedStyle(d);
    if (s.position !== 'fixed') return false;
    const r = d.getBoundingClientRect();
    return r.width >= innerWidth - 4 && r.height >= innerHeight - 4 && parseInt(s.zIndex || '0', 10) >= 100;
  });
  if (!el) return null;
  return {
    text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 140),
    opacity: getComputedStyle(el).opacity,
    bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
  };
})()`;

async function navigate(url, sessionId, { settleMs = 700 } = {}) {
  await cdp('Page.navigate', { url }, sessionId);
  for (let i = 0; i < 80; i += 1) {
    const ready = await ev('document.readyState', sessionId).catch(() => 'loading');
    if (ready === 'complete') break;
    await sleep(50);
  }
  await sleep(settleMs);
}

async function openPage(width, height, { mobile = true } = {}) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Page.enable', {}, sessionId);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: SPY }, sessionId);
  await cdp(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 2, mobile, screenWidth: width, screenHeight: height },
    sessionId,
  );
  await cdp(
    'Emulation.setUserAgentOverride',
    mobile
      ? {
          userAgent:
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
          platform: 'Linux armv8l',
        }
      : {},
    sessionId,
  ).catch(() => {});
  return { targetId, sessionId };
}

async function closePage({ targetId }) {
  // Browser-level call: the session belongs to the target being closed.
  await cdp('Target.closeTarget', { targetId }).catch(() => {});
}

async function screenshot(name, sessionId, { full = false } = {}) {
  const { data } = await cdp(
    'Page.captureScreenshot',
    { format: 'png', ...(full ? { captureBeyondViewport: true } : {}) },
    sessionId,
  );
  fs.writeFileSync(shotPath(name), Buffer.from(data, 'base64'));
  screenshots.push(shotPath(name));
  return shotPath(name);
}

/** Click the first button/link whose visible text starts with `label`. */
async function clickText(label, sessionId) {
  const before = await ev(
    `(()=>{const el=[...document.querySelectorAll('button,a,[role=button]')].find(b=>(b.innerText||'').trim().startsWith(${JSON.stringify(label)}));if(!el)return 'missing';el.scrollIntoView({block:'center'});return 'ok';})()`,
    sessionId,
  );
  if (before !== 'ok') return { ok: false, reason: `no element starting with "${label}"` };
  await sleep(160);
  const box = await ev(
    `(()=>{const el=[...document.querySelectorAll('button,a,[role=button]')].find(b=>(b.innerText||'').trim().startsWith(${JSON.stringify(label)}));if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:Math.round(r.width),h:Math.round(r.height),disabled:el.disabled===true};})()`,
    sessionId,
  );
  if (!box) return { ok: false, reason: 'element vanished' };
  if (box.disabled) return { ok: false, reason: 'button disabled', box };
  if (box.y < 0 || box.y > (await ev('innerHeight', sessionId))) {
    return { ok: false, reason: `element offscreen y=${Math.round(box.y)}`, box };
  }
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
  return { ok: true, box };
}

async function setField(selector, value, sessionId) {
  return ev(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 'missing';const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return el.value;})()`,
    sessionId,
  );
}

/** Poll for the splash overlay right after a navigation. */
async function watchSplash(sessionId, { ms = 3000, captureName = null } = {}) {
  const t0 = Date.now();
  let seen = false;
  let firstMs = null;
  let lastMs = null;
  let text = '';
  let bodyLocked = false;
  let captured = false;
  while (Date.now() - t0 < ms) {
    const r = await ev(SPLASH_PROBE, sessionId).catch(() => null);
    if (r) {
      if (!seen) {
        seen = true;
        firstMs = Date.now() - t0;
        if (captureName && !captured) {
          captured = true;
          await screenshot(captureName, sessionId).catch(() => {});
        }
      }
      lastMs = Date.now() - t0;
      if (r.text) text = r.text;
      bodyLocked = r.bodyLocked;
    } else if (seen) {
      break;
    }
    await sleep(25);
  }
  return { seen, firstMs, lastMs, visibleMs: seen ? lastMs - firstMs : 0, text, bodyLocked };
}

// ─── scenarios ─────────────────────────────────────────────
const MOBILE = [390, 844];
const MOBILE2 = [412, 915];
const DESKTOP = [1440, 900];

async function scenarioHomepageSplash() {
  section('S1  homepage + splash  (390x844 mobile, 1440x900 desktop)');

  // mobile: splash must appear, self-dismiss, and never lock the page
  const m = await openPage(...MOBILE);
  await navigate(`${BASE}/`, m.sessionId);
  await ev('sessionStorage.clear()', m.sessionId);
  await cdp('Page.reload', { ignoreCache: true }, m.sessionId);
  const splash = await watchSplash(m.sessionId, { captureName: '01-splash-390' });
  check('mobile 390x844 shows the splash', splash.seen, splash.text.slice(0, 60));
  check('splash text carries brand + humanitarian tagline', /KhidmatConnect/i.test(splash.text) && /Humanitarian/i.test(splash.text), splash.text);
  check('splash self-dismisses', splash.seen && splash.visibleMs > 200 && splash.visibleMs <= 2100, `${splash.visibleMs}ms`);
  check('splash never locks body scrolling (no layout shift)', splash.bodyLocked === false);
  await sleep(400);
  const after = await ev(LAYOUT, m.sessionId);
  await screenshot('02-home-390', m.sessionId);
  check('homepage is interactive after the fade', (await ev('document.querySelectorAll("a,button").length', m.sessionId)) > 8);
  check('390px: no horizontal overflow', !after.overflow, JSON.stringify({ iw: after.iw, sw: after.sw, offenders: after.offenders }));
  // Once per session: the flag is set by the visit above, so a second visit
  // must go straight to the homepage. (Deliberately no sessionStorage.clear().)
  check('the session flag was written', (await ev(`sessionStorage.getItem('khidmatconnect.splashSeen')`, m.sessionId)) === '1');
  await navigate(`${BASE}/`, m.sessionId);
  const replay = await watchSplash(m.sessionId, { ms: 2200 });
  check('splash does not replay on a second visit in the session', !replay.seen);

  // hero breathing room (PART 7)
  const hero = await ev(
    `(()=>{
      const note=[...document.querySelectorAll('p,div,span')].find(e=>{const t=(e.innerText||'').trim();return t.length>10&&t.length<160&&/No login or sign-up required/i.test(t)&&e.children.length===0;});
      if(!note)return {missing:true};
      let card=note.parentElement;
      while(card&&parseFloat(getComputedStyle(card).paddingBottom||'0')<=0)card=card.parentElement;
      const cs=card?getComputedStyle(card):null;
      const nb=note.getBoundingClientRect();
      return { pb:cs?parseFloat(cs.paddingBottom):null, mb:cs?parseFloat(cs.marginBottom):null,
               gap:card?Math.round(card.getBoundingClientRect().bottom-nb.bottom):null,
               cardH:card?Math.round(card.getBoundingClientRect().height):null, note:(note.innerText||'').trim() };
    })()`,
    m.sessionId,
  );
  check('390px hero: note sits 16-34px above the hero edge', hero.missing !== true && hero.gap >= 16 && hero.gap <= 34, JSON.stringify(hero));

  // tap targets on the primary path
  const targets = await ev(
    `(()=>{const want=['Request Emergency Help','Explore Nearby Help','Detect','Use My'];
      return [...document.querySelectorAll('a,button')].filter(b=>want.some(w=>(b.innerText||'').includes(w))).map(b=>({t:(b.innerText||'').trim().slice(0,26),h:Math.round(b.getBoundingClientRect().height),w:Math.round(b.getBoundingClientRect().width)}));})()`,
    m.sessionId,
  );
  check('hero CTAs are >=44px tall', targets.length >= 2 && targets.every((t) => t.h >= 44), JSON.stringify(targets));

  // navbar sanity at 390px
  const nav = await ev(
    `(()=>{const h=document.querySelector('header,nav');if(!h)return null;const r=h.getBoundingClientRect();const kids=[...h.querySelectorAll('a,button')].map(e=>e.getBoundingClientRect());
      return {h:Math.round(r.height),offscreen:kids.filter(k=>k.right>innerWidth+1||k.left<-1).length,rightMost:Math.round(Math.max(...kids.map(k=>k.right)))};})()`,
    m.sessionId,
  );
  check('navbar fits 390px (no items past the right edge)', nav && nav.offscreen === 0, JSON.stringify(nav));

  // tablet-ish width still gets the splash, desktop must not
  const t = await openPage(820, 1180, { mobile: true });
  await navigate(`${BASE}/`, t.sessionId);
  await ev('sessionStorage.clear()', t.sessionId);
  await cdp('Page.reload', {}, t.sessionId);
  const tablet = await watchSplash(t.sessionId, { captureName: '03-splash-820-tablet' });
  check('tablet 820x1180 also gets the splash', tablet.seen);
  await closePage(t);

  const d = await openPage(...DESKTOP, { mobile: false });
  await navigate(`${BASE}/`, d.sessionId);
  await ev('sessionStorage.clear()', d.sessionId);
  await cdp('Page.reload', { ignoreCache: true }, d.sessionId);
  const desk = await watchSplash(d.sessionId, { ms: 2600 });
  check('H. desktop 1440x900 never shows the splash', !desk.seen);
  const dhero = await ev(
    `(()=>{const note=[...document.querySelectorAll('p,div,span')].find(e=>{const t=(e.innerText||'').trim();return t.length>10&&t.length<160&&/No login or sign-up required/i.test(t)&&e.children.length===0;});if(!note)return {missing:true};let card=note.parentElement;while(card&&parseFloat(getComputedStyle(card).paddingBottom||'0')<=0)card=card.parentElement;
      return {pb:card?parseFloat(getComputedStyle(card).paddingBottom):null,gap:card?Math.round(card.getBoundingClientRect().bottom-note.getBoundingClientRect().bottom):null};})()`,
    d.sessionId,
  );
  check('desktop hero: 22-40px of breathing room', dhero.missing !== true && dhero.gap >= 22 && dhero.gap <= 40, JSON.stringify(dhero));
  const dlay = await ev(LAYOUT, d.sessionId);
  check('1440px: no horizontal overflow', !dlay.overflow, JSON.stringify({ sw: dlay.sw, iw: dlay.iw }));
  await screenshot('04-home-1440', d.sessionId);
  await closePage(d);
  await closePage(m);
}

async function scenarioEmergencyBlocked() {
  section('S2  /emergency with the permission genuinely BLOCKED (real Chrome denial)');
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
  const p = await openPage(...MOBILE);
  await navigate(`${BASE}/emergency`, p.sessionId);
  await screenshot('05-emergency-390-default', p.sessionId, { full: true });

  const initial = await ev(GEO_COUNTERS, p.sessionId);
  check('A. mount makes ZERO geolocation position calls', initial.getCurrentPosition === 0 && initial.watchPosition === 0, JSON.stringify(initial));
  check('mount does read the stored decision via Permissions API', initial.permissionsQuery >= 1, `permissionsQuery=${initial.permissionsQuery}`);
  const label = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Current Location|لوکیشن|لوکیشن|Location/i.test(x.innerText||''));return b?b.innerText.trim():null;})()`, p.sessionId);
  check('button reads "Use My Current Location" before any click', /Use My Current Location/.test(String(label)), String(label));

  const beforeClick = await ev(GEO_COUNTERS, p.sessionId);
  const click = await clickText('Use My Current Location', p.sessionId);
  check('the GPS button is clickable at 390px', click.ok, JSON.stringify(click.box || click.reason));
  await sleep(900);
  const afterClick = await ev(GEO_COUNTERS, p.sessionId);
  check('PART 3: a BLOCKED permission costs zero navigator.geolocation calls, even on click', afterClick.getCurrentPosition === beforeClick.getCurrentPosition, JSON.stringify({ before: beforeClick.getCurrentPosition, after: afterClick.getCurrentPosition }));
  const blockedUi = await ev(`document.body.innerText`, p.sessionId);
  check('blocked copy explains how to un-block AND the manual route', /Location access is blocked/.test(blockedUi) && /address \/ landmark/.test(blockedUi));
  check('a "Try Again" affordance is offered', /Try Again/.test(blockedUi));
  check('the failure is not disguised as a GPS hardware problem', !/couldn't detect your location/i.test(blockedUi.split('Try Again')[0]));
  await screenshot('06-emergency-390-blocked', p.sessionId, { full: true });

  // Try Again = exactly one honest attempt
  const g0 = await ev(GEO_COUNTERS, p.sessionId);
  const retry = await clickText('Try Again', p.sessionId);
  await sleep(900);
  const g1 = await ev(GEO_COUNTERS, p.sessionId);
  check('PART 3: "Try Again" makes exactly one real attempt', retry.ok && g1.getCurrentPosition === g0.getCurrentPosition + 1, JSON.stringify({ before: g0.getCurrentPosition, after: g1.getCurrentPosition }));

  // F + G: manual location still works and submission never needs coordinates
  const typed = await setField('input[type=text], textarea', 'Gulshan-e-Iqbal Block 6 Karachi', p.sessionId);
  const survived = await sleep(1200).then(() => ev(`document.querySelector('input[type=text], textarea').value`, p.sessionId));
  check('G. typed landmark is accepted and not overwritten', survived === 'Gulshan-e-Iqbal Block 6 Karachi', `${typed} -> ${survived}`);
  await setField('textarea', 'My mother collapsed and is not breathing', p.sessionId);
  const telSel = await ev(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>x.type==='tel');return i?'input[type=tel]':null;})()`, p.sessionId);
  if (telSel) await setField(telSel, '0300-8241001', p.sessionId);
  await sleep(400);
  const submitState = await ev(
    `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Submit Emergency/i.test(x.innerText||''));return b?{text:b.innerText.trim().slice(0,40),disabled:b.disabled}:null;})()`,
    p.sessionId,
  );
  check('F. submission is ENABLED with no coordinates at all', !!submitState && submitState.disabled === false, JSON.stringify(submitState));
  await screenshot('07-emergency-390-manual', p.sessionId, { full: true });
  const lay = await ev(LAYOUT, p.sessionId);
  check('412px/390px emergency: no horizontal overflow', !lay.overflow, JSON.stringify({ iw: lay.iw, sw: lay.sw, offenders: lay.offenders }));

  // live un-block must heal without a reload
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'granted' });
  await cdp('Emulation.setGeolocationOverride', { latitude: 24.9245, longitude: 67.0982, accuracy: 20 }, p.sessionId);
  await sleep(500);
  const g2 = await ev(GEO_COUNTERS, p.sessionId);
  const healed = await clickText('Use My Current Location', p.sessionId);
  await sleep(1500);
  const g3 = await ev(GEO_COUNTERS, p.sessionId);
  const uiText = await ev('document.body.innerText', p.sessionId);
  check('PART 3: un-blocking in the browser is picked up live (one call, success)', healed.ok && g3.getCurrentPosition === g2.getCurrentPosition + 1, JSON.stringify({ before: g2.getCurrentPosition, after: g3.getCurrentPosition }));
  check('success copy is "Location detected"', /Location detected/.test(uiText), uiText.match(/Location detected[^\n]*/)?.[0] || 'n/a');
  await screenshot('08-emergency-390-detected', p.sessionId, { full: true });
  const geoPayload = await ev(
    `(()=>{const i=[...document.querySelectorAll('input[type=text],textarea')].map(x=>x.value);return i.join(' | ');})()`,
    p.sessionId,
  );
  check('detected position lands in the visible location field', /24\.9|Gulshan|Block/.test(geoPayload), geoPayload.slice(0, 90));

  // RTL
  await navigate(`${BASE}/emergency`, p.sessionId);
  await ev('sessionStorage.clear()', p.sessionId);
  await clickText('اردو', p.sessionId).catch(() => {});
  await sleep(500);
  const rtl = await ev(
    `(()=>{const wrap=[...document.querySelectorAll('div')].find(d=>d.getAttribute('dir')==='rtl');const dir=document.documentElement.getAttribute('dir');
      const btn=[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(t=>/لوکیشن|مقام/.test(t)).slice(0,4);
      const de=document.documentElement;return {hasRtlWrap:!!wrap,htmlDir:dir,iw:innerWidth,sw:de.scrollWidth,overflow:de.scrollWidth>innerWidth+1,btn};})()`,
    p.sessionId,
  );
  check('Urdu /emergency renders an RTL subtree', rtl.hasRtlWrap, JSON.stringify(rtl).slice(0, 160));
  check('Urdu /emergency keeps the localized GPS label', rtl.btn.length > 0, JSON.stringify(rtl.btn));
  check('Urdu /emergency has no horizontal overflow', !rtl.overflow, JSON.stringify({ iw: rtl.iw, sw: rtl.sw }));
  await screenshot('09-emergency-390-urdu', p.sessionId, { full: true });
  // The previously reported leak: an error string frozen in state stayed English
  // even after switching to Urdu. It must now be derived from the live language.
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
  await cdp('Emulation.clearGeolocationOverride', {}, p.sessionId).catch(() => {});
  await clickText('میری', p.sessionId).catch(async () => {
    await clickText('لوکیشن', p.sessionId);
  });
  await sleep(1000);
  const urduUi = await ev('document.body.innerText', p.sessionId);
  const englishLeak = /We couldn't detect your location|Location access is blocked|Location detection timed out|Your browser does not support|Try Again|Use My Current Location/i.test(urduUi);
  check('no English geolocation copy leaks into the Urdu layout', !englishLeak, englishLeak ? urduUi.split('\n').filter((l) => /blocked|couldn't|Try Again/i.test(l)).join(' / ').slice(0, 120) : 'clean');
  await screenshot('10-emergency-390-urdu-blocked', p.sessionId, { full: true });
  await closePage(p);
}

async function scenarioNearby() {
  section('S3  /nearby (no GPS on load, click-only, still usable when blocked)');
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
  const p = await openPage(...MOBILE2);
  await navigate(`${BASE}/nearby`, p.sessionId);
  await screenshot('11-nearby-412-default', p.sessionId);
  const initial = await ev(GEO_COUNTERS, p.sessionId);
  check('B. /nearby makes ZERO geolocation calls on mount', initial.getCurrentPosition === 0 && initial.watchPosition === 0, JSON.stringify(initial));
  const ui = await ev('document.body.innerText', p.sessionId);
  check('prompt copy is "Use your location to find nearby help."', /Use your location to find nearby help\./.test(ui));
  check('button copy is "Detect My Location"', /Detect My Location/.test(ui));
  const c0 = await ev(GEO_COUNTERS, p.sessionId);
  await clickText('Detect My Location', p.sessionId);
  await sleep(900);
  const c1 = await ev(GEO_COUNTERS, p.sessionId);
  check('blocked /nearby also costs zero API calls per click', c1.getCurrentPosition === c0.getCurrentPosition, JSON.stringify({ before: c0.getCurrentPosition, after: c1.getCurrentPosition }));
  const ui2 = await ev('document.body.innerText', p.sessionId);
  const dupes = (ui2.match(/Location access is blocked/g) || []).length;
  check('the blocked explanation is shown once, not duplicated', dupes <= 1, `occurrences=${dupes}`);
  const cards = await ev(`document.querySelectorAll('a[href^="tel:"]').length`, p.sessionId);
  check('help listings stay usable without a location', cards >= 3, `tel links=${cards}`);
  const lay = await ev(LAYOUT, p.sessionId);
  check('412x915 /nearby: no horizontal overflow', !lay.overflow, JSON.stringify({ iw: lay.iw, sw: lay.sw, offenders: lay.offenders }));
  await screenshot('12-nearby-412-blocked', p.sessionId);
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'granted' });
  await cdp('Emulation.setGeolocationOverride', { latitude: 24.9245, longitude: 67.0982, accuracy: 20 }, p.sessionId);
  await clickText('Detect My Location', p.sessionId);
  await sleep(1600);
  const lay2 = await ev(LAYOUT, p.sessionId);
  check('412x915 /nearby after detection: still no overflow', !lay2.overflow, JSON.stringify({ sw: lay2.sw }));
  await screenshot('13-nearby-412-detected', p.sessionId);
  await closePage(p);
}

async function scenarioResponder() {
  section('S4  /responder live tracking (one watcher, survives polling)');
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'granted' });
  const p = await openPage(...MOBILE);
  await navigate(`${BASE}/login`, p.sessionId);
  const login = await clickText('Responder Demo', p.sessionId);
  check('responder demo login reachable', login.ok, String(login.reason || ''));
  let whereTo = '';
  for (let i = 0; i < 40; i += 1) {
    whereTo = String(await ev('location.pathname', p.sessionId));
    if (whereTo.startsWith('/responder')) break;
    await sleep(200);
  }
  if (!whereTo.startsWith('/responder')) {
    check('responder session established', false, `landed on ${whereTo}`);
    await screenshot('14-responder-login-failed', p.sessionId);
    await closePage(p);
    return;
  }
  await sleep(1500);
  check('responder dashboard reached after login', true, whereTo);
  await screenshot('14-responder-390', p.sessionId, { full: true });
  const onMount = await ev(GEO_COUNTERS, p.sessionId);
  check('C. responder dashboard opens ZERO watchers on mount', onMount.watchPosition === 0 && onMount.getCurrentPosition === 0, JSON.stringify(onMount));
  const ui = await ev('document.body.innerText', p.sessionId);
  check('a consent-labelled location-sharing control exists', /Start Location Sharing/.test(ui), ui.split('\n').filter((l) => /Location Sharing|sharing/i.test(l)).slice(0, 3).join(' / ').slice(0, 120));

  const before = await ev(GEO_COUNTERS, p.sessionId);
  const start = await clickText('Start Location Sharing', p.sessionId);
  check('start control is enabled at 390px', start.ok, JSON.stringify(start.box || start.reason));
  await sleep(1200);
  const justStarted = await ev(GEO_COUNTERS, p.sessionId);
  check('D. exactly ONE watchPosition opens for the session', justStarted.watchPosition - before.watchPosition === 1, `delta=${justStarted.watchPosition - before.watchPosition}`);
  check('tracking never polls getCurrentPosition', justStarted.getCurrentPosition - before.getCurrentPosition === 0, `delta=${justStarted.getCurrentPosition - before.getCurrentPosition}`);
  check(
    'PART 4: the watch is opened WITHOUT a per-acquisition timeout (stationary device must not kill tracking)',
    justStarted.watchOptions && justStarted.watchOptions.timeout === undefined,
    JSON.stringify(justStarted.watchOptions),
  );
  check(
    'PART 4: the watch still declares high accuracy + cache age',
    !!justStarted.watchOptions && justStarted.watchOptions.enableHighAccuracy === true && typeof justStarted.watchOptions.maximumAge === 'number',
    JSON.stringify(justStarted.watchOptions),
  );

  // Let the assignment poll run through at least two cycles. Polling object
  // identity used to restart the watcher; the watcher count is the proof.
  await sleep(26000);
  const afterPolls = await ev(GEO_COUNTERS, p.sessionId);
  check('D. two assignment polls later there is STILL only one watcher', afterPolls.watchPosition - before.watchPosition === 1, `total watchPosition=${afterPolls.watchPosition}`);
  check('D. never two watchers alive at the same instant', afterPolls.maxActive === 1, `maxActive=${afterPolls.maxActive}`);
  check('the subscription is still open after ~30s of polling (no silent death)', afterPolls.clearWatch - before.clearWatch === 0, `clearWatch delta=${afterPolls.clearWatch - before.clearWatch}`);
  check('no background permission re-check while tracking', afterPolls.getCurrentPosition - before.getCurrentPosition === 0, `gcp delta=${afterPolls.getCurrentPosition - before.getCurrentPosition}`);
  const statusUi = await ev('document.body.innerText', p.sessionId);
  check('UI reports the sharing state (not a silent tracker)', /Active|Sharing|Ready|GPS|location/i.test(statusUi));
  // A demo must never have to hunt for the tracking control: it has to be fully
  // visible on first paint, clear of the fixed bottom nav, and a real tap target.
  const controlFit = await ev(
    `(()=>{const bar=[...document.querySelectorAll('nav')].find(n=>getComputedStyle(n).position==='fixed'&&n.getBoundingClientRect().top>innerHeight*0.6);const limit=bar?bar.getBoundingClientRect().top:innerHeight;
      const out=[];for(const b of document.querySelectorAll('button')){const label=(b.innerText||'').trim();
        if(/Location Sharing|Go Offline|Dispatch Drill/.test(label)){const r=b.getBoundingClientRect();out.push({label,top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),visible:r.top>=0&&r.bottom<=limit});}}
      return {limit:Math.round(limit),innerHeight,out};})()`,
    p.sessionId,
  );
  const sharingControl = controlFit.out.find((b) => /Location Sharing/.test(b.label));
  check('the location-sharing control is fully visible above the bottom nav at 390px', !!sharingControl && sharingControl.visible && sharingControl.h >= 44, JSON.stringify(controlFit));
  await screenshot('15-responder-390-sharing', p.sessionId, { full: true });

  const stop = await clickText('Stop Location Sharing', p.sessionId);
  await sleep(800);
  const stopped = await ev(GEO_COUNTERS, p.sessionId);
  check('E. explicit stop clears the watcher exactly once', stop.ok && stopped.clearWatch - afterPolls.clearWatch === 1, JSON.stringify({ ok: stop.ok, delta: stopped.clearWatch - afterPolls.clearWatch }));
  await clickText('Start Location Sharing', p.sessionId);
  await sleep(700);
  const restarted = await ev(GEO_COUNTERS, p.sessionId);
  check('re-start opens a fresh single watcher (total 2 over two sessions)', restarted.watchPosition - before.watchPosition === 2, `total=${restarted.watchPosition}`);
  // Unmount cleanup. A client-side route change keeps the JS context (and
  // therefore __geo) alive, so the clear is directly observable.
  const beforeLeave = await ev(GEO_COUNTERS, p.sessionId);
  const navVia = await ev(
    `(()=>{const a=document.querySelector('a[href="/"]')||[...document.querySelectorAll('a')].find(x=>/^\\/$/.test(x.getAttribute('href')||''));if(!a)return 'missing';a.click();return 'clicked';})()`,
    p.sessionId,
  );
  await sleep(1500);
  const afterLeave = await ev(GEO_COUNTERS, p.sessionId).catch(() => null);
  const clearedOnUnmount =
    !!afterLeave &&
    afterLeave.watchPosition === beforeLeave.watchPosition &&
    afterLeave.clearWatch > beforeLeave.clearWatch;
  check('E. unmounting the responder screen clears the live watcher', clearedOnUnmount, JSON.stringify({ navVia, ctx: !!afterLeave, path: await ev('location.pathname', p.sessionId).catch(() => '?'), before: beforeLeave.clearWatch, after: afterLeave?.clearWatch }));

  // blocked responder keeps the API untouched
  const p2 = await openPage(...MOBILE2);
  await navigate(`${BASE}/login`, p2.sessionId);
  await clickText('Responder Demo', p2.sessionId);
  await sleep(2500);
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
  await cdp('Emulation.clearGeolocationOverride', {}, p2.sessionId).catch(() => {});
  await navigate(`${BASE}/responder`, p2.sessionId);
  await sleep(1200);
  const b0 = await ev(GEO_COUNTERS, p2.sessionId);
  await clickText('Start Location Sharing', p2.sessionId).catch(() => {});
  await sleep(1200);
  const b1 = await ev(GEO_COUNTERS, p2.sessionId);
  const blockedUi = await ev('document.body.innerText', p2.sessionId);
  check('C/D. a blocked responder never opens a watcher, even on click', b1.watchPosition === b0.watchPosition && b1.watchPosition === 0, JSON.stringify(b1));
  check('the responder is told how to un-block', /blocked|Block/i.test(blockedUi), blockedUi.split('\n').filter((l) => /block/i.test(l)).slice(0, 2).join(' / ').slice(0, 110));
  await screenshot('16-responder-412-blocked', p2.sessionId, { full: true });
  const lay = await ev(LAYOUT, p2.sessionId);
  check('412x915 /responder: no horizontal overflow', !lay.overflow, JSON.stringify({ iw: lay.iw, sw: lay.sw, offenders: lay.offenders }));
  await closePage(p);
  await closePage(p2);
}

async function scenarioDeepLinksAndHero() {
  section('S5  deep links, hero spacing, reduced motion');
  await cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
  for (const route of ['/operator', '/responder', '/case/KC-2026-000035', '/dashboard']) {
    const p = await openPage(...MOBILE);
    await navigate(`${BASE}${route}`, p.sessionId, { settleMs: 900 });
    await ev('sessionStorage.clear()', p.sessionId);
    await cdp('Page.reload', {}, p.sessionId);
    const s = await watchSplash(p.sessionId, { ms: 1800 });
    check(`I. ${route} never shows the splash`, !s.seen);
    const lay = await ev(LAYOUT, p.sessionId);
    check(`${route} has no horizontal overflow at 390px`, !lay.overflow, JSON.stringify({ sw: lay.sw, offenders: lay.offenders.slice(0, 2) }));
    await screenshot(`17-deeplink${route.replace(/\W+/g, '_')}`, p.sessionId);
    await closePage(p);
  }

  // 412x915 hero pass + mobile bottom nav clearance
  const p = await openPage(...MOBILE2);
  await navigate(`${BASE}/`, p.sessionId);
  await ev('sessionStorage.clear()', p.sessionId);
  await cdp('Page.reload', {}, p.sessionId);
  const s412 = await watchSplash(p.sessionId, { captureName: '18-splash-412' });
  check('mobile 412x915 shows the splash too', s412.seen, `${s412.visibleMs}ms`);
  await sleep(500);
  const hero = await ev(
    `(()=>{const note=[...document.querySelectorAll('p,div,span')].find(e=>{const t=(e.innerText||'').trim();return t.length>10&&t.length<160&&/No login or sign-up required/i.test(t)&&e.children.length===0;});if(!note)return {missing:true};let card=note.parentElement;while(card&&parseFloat(getComputedStyle(card).paddingBottom||'0')<=0)card=card.parentElement;
      const nb=note.getBoundingClientRect();
      const bar=[...document.querySelectorAll('nav')].map(n=>{const r=n.getBoundingClientRect();return {top:Math.round(r.top),h:Math.round(r.height),fixed:getComputedStyle(n).position};}).filter(x=>x.fixed==='fixed');
      return {gap:card?Math.round(card.getBoundingClientRect().bottom-nb.bottom):null, bottomBar:bar};})()`,
    p.sessionId,
  );
  check('412px hero gap in the 16-34px band', hero.missing !== true && hero.gap >= 16 && hero.gap <= 34, JSON.stringify(hero));
  const overlapped =
    hero.bottomBar?.length &&
    (await ev(
      `(()=>{const note=[...document.querySelectorAll('p,div,span')].find(e=>/No login or sign-up required/i.test((e.innerText||'').trim())&&e.children.length===0);if(!note)return 'none';const r=note.getBoundingClientRect();
        const bar=[...document.querySelectorAll('nav')].find(n=>getComputedStyle(n).position==='fixed'&&n.getBoundingClientRect().top>innerHeight*0.6);if(!bar)return 'no-bar';const b=bar.getBoundingClientRect();return r.bottom>b.top-2?'OVERLAP':'clear';})()`,
      p.sessionId,
    ));
  check('hero note is not hidden behind the fixed bottom nav', overlapped !== 'OVERLAP', String(overlapped));
  await screenshot('19-home-412', p.sessionId);

  // Urdu RTL homepage geometry
  await clickText('اردو', p.sessionId);
  await sleep(600);
  const urdu = await ev(
    `(()=>{const de=document.documentElement;const wrap=[...document.querySelectorAll('div')].find(d=>d.getAttribute('dir')==='rtl');
      const note=[...document.querySelectorAll('p,div,span')].find(e=>/نہیں|لاگ ان/i.test((e.innerText||'').trim())&&e.children.length===0&&e.getBoundingClientRect().height>0);
      let card=note?note.parentElement:null;while(card&&parseFloat(getComputedStyle(card).paddingBottom||'0')<=0)card=card.parentElement;
      const firstCharRight=wrap?(()=>{const el=[...wrap.querySelectorAll('h1,h2,p')].find(x=>x.getBoundingClientRect().height>0);if(!el)return null;return Math.round(innerWidth-el.getBoundingClientRect().right);}):(0);
      return {rtl:!!wrap,overflow:de.scrollWidth>innerWidth+1,sw:de.scrollWidth,iw:innerWidth,gap:card&&note?Math.round(card.getBoundingClientRect().bottom-note.getBoundingClientRect().bottom):null, rightInset:firstCharRight};})()`,
    p.sessionId,
  );
  check('Urdu homepage activates dir="rtl"', urdu.rtl === true);
  check('Urdu homepage has no horizontal overflow at 412px', !urdu.overflow, JSON.stringify({ sw: urdu.sw, iw: urdu.iw }));
  check('Urdu hero keeps the same breathing room', urdu.gap === null || (urdu.gap >= 16 && urdu.gap <= 34), JSON.stringify(urdu));
  await screenshot('20-home-412-urdu', p.sessionId, { full: true });

  // reduced motion
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, p.sessionId);
  await ev('sessionStorage.clear()', p.sessionId);
  await cdp('Page.reload', {}, p.sessionId);
  const rm = await watchSplash(p.sessionId, { ms: 2200, captureName: '21-splash-reduced-motion' });
  check('reduced-motion still shows the brand frame, then leaves', rm.seen && rm.visibleMs > 100 && rm.visibleMs <= 1400, `${rm.visibleMs}ms`);
  await cdp('Emulation.setEmulatedMedia', { features: [] }, p.sessionId);
  await closePage(p);
}

async function main() {
  console.log(`KhidmatConnect AI - PART 8 real-browser verification`);
  console.log(`base=${BASE}  chrome="${CHROME}"  artifacts=${OUT}`);
  const chrome = launchChrome();
  const url = await connect();
  ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
    setTimeout(() => reject(new Error('ws open timeout')), 10000);
  });
  ws.onmessage = (raw) => {
    const m = JSON.parse(raw.data);
    if (m.id !== undefined) settle(m);
  };
  cdp('Target.setDiscoverTargets', { discover: false }).catch(() => {});

  const scenarios = [
    scenarioHomepageSplash,
    scenarioEmergencyBlocked,
    scenarioNearby,
    scenarioResponder,
    scenarioDeepLinksAndHero,
  ];
  for (const s of scenarios) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await s();
    } catch (err) {
      check(`${s.name} completed`, false, String(err).slice(0, 220));
    }
  }

  ws.close();
  chrome.kill();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`passed: ${pass}   failed: ${fail}`);
  console.log(`screenshots: ${OUT}`);
  if (fail > 0) {
    console.log('\nfailures:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}  ${r.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

process.on('unhandledRejection', (e) => {
  console.error('unhandled rejection', e);
  process.exit(2);
});

main();
