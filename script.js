/* ==========================================================
   THE FORT BUILDER CHRONICLE: stopwatch engine
   ----------------------------------------------------------
   Elapsed time is ALWAYS derived from one fixed instant:
     30 Oct 2026, 04:29:10 AM, Asia/Dhaka (UTC+06:00)
     = 29 Oct 2026, 22:29:10 UTC
     = Unix epoch 1793312950 seconds
   Nothing is stored in the browser and nothing is counted up
   one tick at a time, so reloads, tab suspension, locked
   screens and timer throttling cannot change the result.
   ========================================================== */
(function (root) {
  'use strict';

  /* ---------- Fixed constants (never replaced by "now") ---------- */
  var START_EPOCH_MS = 1793312950000;           // 2026-10-29T22:29:10Z = 2026-10-30T04:29:10+06:00
  var PLAYER_TAG = '#GV20G9GJJ';
  var MIN_DAY_DIGITS = 6;                       // minimum zero padding only; there is NO maximum

  /* ---------- Time maths (pure, testable, no DOM) ---------- */
  var HAS_BIGINT = typeof root.BigInt === 'function';

  /**
   * Splits the span between startMs and nowMs into whole days, hours, minutes, seconds.
   * Uses BigInt when available so the day count has no 32-bit or 53-bit ceiling.
   * (BigInt() calls are used instead of 123n literals so very old browsers can still parse this file.)
   */
  function decompose(nowMs, startMs) {
    var diffMs;
    if (HAS_BIGINT) {
      var B = root.BigInt;
      var diff = B(Math.trunc(nowMs)) - B(startMs);
      if (diff < B(0)) return { negative: true, days: '0', hours: 0, minutes: 0, seconds: 0 };
      var totalSec = diff / B(1000);
      var days = totalSec / B(86400);
      var rem = Number(totalSec % B(86400));
      return {
        negative: false,
        days: days.toString(),
        hours: Math.floor(rem / 3600),
        minutes: Math.floor((rem % 3600) / 60),
        seconds: rem % 60
      };
    }
    // Fallback for browsers without BigInt: exact up to 2^53 ms (about 285,000 years)
    diffMs = Math.trunc(nowMs) - startMs;
    if (diffMs < 0) return { negative: true, days: '0', hours: 0, minutes: 0, seconds: 0 };
    var sec = Math.floor(diffMs / 1000);
    var d = Math.floor(sec / 86400);
    var r = sec - d * 86400;
    return {
      negative: false,
      days: String(d).indexOf('e') === -1 ? String(d) : d.toLocaleString('fullwide', { useGrouping: false }),
      hours: Math.floor(r / 3600),
      minutes: Math.floor((r % 3600) / 60),
      seconds: r % 60
    };
  }

  /** Zero-pads to at least MIN_DAY_DIGITS; longer numbers are never cut off. */
  function formatDays(daysStr) {
    var s = String(daysStr);
    while (s.length < MIN_DAY_DIGITS) s = '0' + s;
    return s;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /* Expose the pure logic for tests (Node) and debugging (browser console). */
  var api = { START_EPOCH_MS: START_EPOCH_MS, PLAYER_TAG: PLAYER_TAG, decompose: decompose, formatDays: formatDays };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof root.document === 'undefined') return;   // Node: stop here, no DOM work
  root.FortChronicle = api;

  /* ==========================================================
     BROWSER ONLY
     ========================================================== */
  var doc = root.document;
  var started = false;

  function $(id) { return doc.getElementById(id); }

  var el = {
    days: $('days'), hours: $('hours'), minutes: $('minutes'), seconds: $('seconds'),
    bar: $('bar'), status: $('status'),
    copyBtn: $('copy-btn'), copyLabel: $('copy-label'), toast: $('toast'), tag: $('player-tag'),
    embers: $('embers')
  };

  var reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Budget-device detection ---------- */
  function isLowPower() {
    var nav = root.navigator || {};
    var conn = nav.connection || {};
    return (
      (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) ||
      (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) ||
      conn.saveData === true
    );
  }
  var lowPower = isLowPower();
  if (lowPower) doc.documentElement.classList.add('lite');

  /* ---------- Rendering (touches the DOM only when a value changed) ---------- */
  var last = { days: '', hours: -1, minutes: -1, seconds: -1, negative: null };

  function pulse(node) {
    if (reduceMotion || !node || typeof node.animate !== 'function') return;
    node.animate(
      [{ transform: 'scale(1.1)', opacity: 0.65 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 320, easing: 'ease-out' }
    );
  }

  function render() {
    var t = decompose(Date.now(), START_EPOCH_MS);

    var daysText = formatDays(t.days);
    if (daysText !== last.days) {
      el.days.textContent = daysText;
      el.days.style.setProperty('--digits', String(Math.max(daysText.length, MIN_DAY_DIGITS)));
      last.days = daysText;
    }
    if (t.hours !== last.hours) {
      el.hours.textContent = pad2(t.hours);
      if (last.hours !== -1) pulse(el.hours);
    }
    if (t.minutes !== last.minutes) {
      el.minutes.textContent = pad2(t.minutes);
      if (last.minutes !== -1) pulse(el.minutes);
    }
    if (t.seconds !== last.seconds) {
      el.seconds.textContent = pad2(t.seconds);
      if (last.seconds !== -1) pulse(el.seconds);

      // Progress bar: fills across the minute. Jump (no animation) when resuming after a gap or on wrap.
      var contiguous = last.seconds !== -1 && t.seconds === (last.seconds + 1) % 60 && t.seconds !== 0;
      el.bar.style.transitionDuration = (contiguous && !reduceMotion) ? '1s' : '0s';
      el.bar.style.transform = 'scaleX(' + ((t.seconds + 1) / 60) + ')';
    }
    if (t.negative !== last.negative) {
      el.status.hidden = !t.negative;
      last.negative = t.negative;
    }
    last.hours = t.hours;
    last.minutes = t.minutes;
    last.seconds = t.seconds;
  }

  /* ---------- Single, self-correcting timer loop ---------- */
  var timer = null;

  function schedule() {
    if (timer !== null) root.clearTimeout(timer);
    // Wake just after the next whole second of the wall clock, recomputed every time,
    // so a delayed or throttled timer can never make the display drift.
    var delay = 1000 - (Date.now() % 1000) + 15;
    timer = root.setTimeout(tick, delay);
  }

  function tick() {
    timer = null;
    try { render(); } catch (err) { if (root.console) root.console.error('Chronicle render error:', err); }
    if (!doc.hidden) schedule();
  }

  function resume() {
    doc.documentElement.classList.toggle('is-hidden', !!doc.hidden);
    if (doc.hidden) {
      if (timer !== null) { root.clearTimeout(timer); timer = null; }   // no background work while hidden
      return;
    }
    tick();                                                              // recalculate immediately
  }

  /* ---------- Embers ---------- */
  function spawnEmbers() {
    if (reduceMotion || !el.embers) return;
    var count = lowPower ? 7 : 18;
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var e = doc.createElement('span');
      e.className = 'ember' + (Math.random() < 0.3 ? ' cool' : '');
      var size = 2 + Math.random() * 3.5;
      e.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
      e.style.setProperty('--s', size.toFixed(1) + 'px');
      e.style.setProperty('--dx', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
      e.style.setProperty('--d', (14 + Math.random() * 18).toFixed(1) + 's');
      e.style.setProperty('--delay', (-Math.random() * 30).toFixed(1) + 's');
      frag.appendChild(e);
    }
    el.embers.appendChild(frag);
  }

  /* ---------- Copy player tag ---------- */
  var toastTimer = null;
  var labelTimer = null;

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('show');
    if (toastTimer !== null) root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { el.toast.classList.remove('show'); }, 2400);
  }

  function legacyCopy(text) {
    var ok = false;
    var active = doc.activeElement;
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
    doc.body.appendChild(ta);
    try {
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = doc.execCommand('copy');
    } catch (err) { ok = false; }
    doc.body.removeChild(ta);
    if (active && typeof active.focus === 'function') active.focus({ preventScroll: true });
    return ok;
  }

  function selectTagText() {
    try {
      var range = doc.createRange();
      range.selectNodeContents(el.tag);
      var sel = root.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) { /* selection is best effort */ }
  }

  function copyTag() {
    var done = function (ok) {
      if (ok) {
        showToast('Player tag copied: ' + PLAYER_TAG);
        el.copyBtn.classList.add('done');
        el.copyLabel.textContent = 'Copied!';
        if (labelTimer !== null) root.clearTimeout(labelTimer);
        labelTimer = root.setTimeout(function () {
          el.copyBtn.classList.remove('done');
          el.copyLabel.textContent = 'Copy tag';
        }, 2000);
      } else {
        selectTagText();
        showToast('Tag selected. Press and hold it, then choose Copy.');
      }
    };

    var nav = root.navigator;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function' && root.isSecureContext) {
      nav.clipboard.writeText(PLAYER_TAG).then(
        function () { done(true); },
        function () { done(legacyCopy(PLAYER_TAG)); }
      );
    } else {
      done(legacyCopy(PLAYER_TAG));
    }
  }

  /* ---------- Start (guarded so listeners are only attached once) ---------- */
  function start() {
    if (started) return;
    started = true;

    render();
    resume();
    spawnEmbers();

    doc.addEventListener('visibilitychange', resume);
    root.addEventListener('pageshow', function () { resume(); });    // restored from back/forward cache
    root.addEventListener('focus', function () { if (!doc.hidden) tick(); });
    root.addEventListener('online', function () { if (!doc.hidden) tick(); });
    doc.addEventListener('resume', function () { if (!doc.hidden) tick(); });  // Page Lifecycle API

    if (el.copyBtn) el.copyBtn.addEventListener('click', copyTag);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();

  /* ---------- Offline support (optional; the stopwatch works without it) ---------- */
  if ('serviceWorker' in root.navigator && /^https?:$/.test(root.location.protocol)) {
    root.addEventListener('load', function () {
      root.navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
