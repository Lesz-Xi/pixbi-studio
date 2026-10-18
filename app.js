/* Cozy Cabin — redesign study.
   One evening in the cabin: scroll is the in-game clock, and the page answers to
   the game's own keys (W/S between rooms of the page, A/D along the walk, E to use
   what is in front of you). The page scrolls the document; Lenis rides gsap.ticker,
   the rain canvas joins that same ticker, and nothing runs while it is off screen.
   Without GSAP, or with reduced motion, every section is already visible and the
   clock, keys, sprint and rain sound still work. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var motion = !!(gsap && ST) && !reduce;

  function $(s, el) { return (el || doc).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  var header = $(".top");
  var hud = $("[data-hud]");
  var hudTime = $("[data-hud-time]");
  var walk = $(".walk");
  var rooms = $$(".room");
  var night = $(".night");
  var toastEl = $("[data-toast]");
  var themeMeta = $('meta[name="theme-color"]');
  var navLinks = $$(".nav a");
  var blocks = $$("main > section, .colophon");

  var lenis = null;
  var walkST = null; // the pinned walk, when the layout pins it

  // ── receipts ────────────────────────────────────────────────
  var toastTimer = 0;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, ms || 3200);
  }

  function scrollToY(y) {
    y = Math.max(0, Math.round(y));
    if (lenis) lenis.scrollTo(y, { duration: 1.1 });
    else window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  }

  // ── measurement (page blocks, clock anchors) ────────────────
  var M = { blocks: [], anchors: [], vh: 0, hh: 81 };
  var TONE_COLOR = { day: "#f6ead4", peach: "#e8b48a", dusk: "#1b1514", night: "#12151c" };

  function boxOf(el) {
    var p = el.parentElement;
    return p && p.classList.contains("pin-spacer") ? p : el;
  }

  function clockOf(el) {
    var t = (el.getAttribute("data-clock") || "0:0").split(":");
    return +t[0] * 60 + +t[1];
  }

  function measure() {
    var y0 = window.scrollY;
    M.vh = window.innerHeight;
    M.hh = header.offsetHeight;
    M.blocks = blocks.map(function (el) {
      var r = boxOf(el).getBoundingClientRect();
      return { el: el, id: el.id, tone: el.getAttribute("data-tone") || "night", top: r.top + y0, h: r.height };
    });

    var a = [];
    function centre(el) { var r = boxOf(el).getBoundingClientRect(); return r.top + y0 + r.height / 2 - M.vh / 2; }
    a.push({ pos: 0, min: 9 * 60 + 27 });                       // morning: the welcome still reads 09:27 AM
    a.push({ pos: centre($(".cabin")), min: 9 * 60 + 27 });
    rooms.forEach(function (room, i) {
      var pos = walkST
        ? walkST.start + (i / (rooms.length - 1)) * (walkST.end - walkST.start)
        : centre(room);
      a.push({ pos: pos, min: clockOf(room) });                  // each room's still carries its own time
    });
    a.push({ pos: centre(night), min: clockOf(night) });         // authored: the bedroom still's bar is cropped out
    a.sort(function (p, q) { return p.pos - q.pos; });
    M.anchors = a;
  }

  // ── the in-game clock ──────────────────────────────────────
  var shownMin = -1;
  var sprint = { end: 0, len: 0, timer: 0, done: false };

  function minutesAt(y) {
    var a = M.anchors;
    if (!a.length) return 9 * 60 + 27;
    if (y <= a[0].pos) return a[0].min;
    for (var i = 1; i < a.length; i++) {
      if (y <= a[i].pos) {
        var t = (y - a[i - 1].pos) / Math.max(1, a[i].pos - a[i - 1].pos);
        t = clamp((t - 0.18) / 0.64, 0, 1); // rest on each still's own time near its anchor
        var span = a[i].min - a[i - 1].min;
        return a[i - 1].min + span * t;
      }
    }
    return a[a.length - 1].min;
  }

  function fmt(min) {
    min = Math.floor(min) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    var ap = h < 12 ? "AM" : "PM";
    var h12 = h % 12 || 12;
    return pad(h12) + ":" + pad(m) + " " + ap;
  }

  function renderClock(force) {
    if (sprint.end || sprint.done) return;
    var min = Math.floor(minutesAt(window.scrollY));
    if (!force && min === shownMin) return;
    shownMin = min;
    var text = fmt(min);
    hudTime.textContent = text;
    hud.setAttribute("data-icon", min >= 360 && min < 1080 ? "sun" : "moon");
    hud.setAttribute("aria-label", "In-game time " + text + ". Go to the work room.");
  }

  // ── tone, nav, clock on scroll ─────────────────────────────
  var shownTone = "";
  var scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      var line = window.scrollY + M.hh + 1;
      var cur = M.blocks[0];
      for (var i = 0; i < M.blocks.length; i++) if (M.blocks[i].top <= line) cur = M.blocks[i];
      if (cur && cur.tone !== shownTone) {
        shownTone = cur.tone;
        root.setAttribute("data-tone", shownTone);
        if (themeMeta) themeMeta.setAttribute("content", TONE_COLOR[shownTone] || TONE_COLOR.night);
      }
      navLinks.forEach(function (l) { l.classList.toggle("is-on", !!cur && l.getAttribute("href") === "#" + cur.id); });
      renderClock(false);
    });
  }

  // ── the quiet sprint ───────────────────────────────────────
  // Real time, counted in the HUD and the tab title. The end is remembered across a
  // reload, a soft bell is scheduled on the audio clock (a hidden tab's throttled
  // timers can't make it late, and its end also closes the sprint), the tab icon turns
  // to a done mark, and the receipt holds the way to Steam until it is closed.
  // ?sprint=<seconds> shortens it for the verify suite (3 s to 25 min).
  var SPRINT_MS = 25 * 60 * 1000;
  (function () {
    var s = parseFloat(new URLSearchParams(window.location.search).get("sprint"));
    if (s > 0) SPRINT_MS = clamp(s, 3, 1500) * 1000;
  })();
  var SPRINT_STORE = "pixbi-cabin-sprint";
  var RECEIPT_KEEP = 30 * 60 * 1000; // a finished sprint is still worth showing for half an hour
  var baseTitle = doc.title;
  var sprintBtn = $("[data-sprint]");
  var sprintLabel = $("[data-sprint-label]");
  var receipt = $("[data-receipt]");
  var announcer = $("[data-announce]");
  var favicon = $('link[rel="icon"]');
  var baseIcon = favicon.getAttribute("href");
  var doneIcon = "";
  var bell = null; // the bell's own AudioContext, apart from the rain's

  function saveSprint(state) {
    try {
      if (state) localStorage.setItem(SPRINT_STORE, JSON.stringify(state));
      else localStorage.removeItem(SPRINT_STORE);
    } catch (e) { /* storage blocked: the sprint just isn't remembered */ }
  }
  function loadSprint() {
    try { return JSON.parse(localStorage.getItem(SPRINT_STORE) || "null"); } catch (e) { return null; }
  }
  function lengthWords(ms) {
    var s = Math.round(ms / 1000);
    return s >= 60 ? Math.round(s / 60) + " minutes" : s + " seconds";
  }
  function announce(msg) { announcer.textContent = ""; setTimeout(function () { announcer.textContent = msg; }, 60); }

  // a pixel tick on Steam green, drawn once
  function makeDoneIcon() {
    if (doneIcon) return doneIcon;
    try {
      var c = doc.createElement("canvas");
      c.width = c.height = 32;
      var x = c.getContext("2d");
      x.fillStyle = "#231c1a"; x.fillRect(0, 0, 32, 32);
      x.fillStyle = "#75b022"; x.fillRect(3, 3, 26, 26);
      x.fillStyle = "#fff8ec";
      [[7, 15], [10, 18], [13, 21], [16, 18], [19, 15], [22, 12]].forEach(function (p) { x.fillRect(p[0], p[1], 3, 5); });
      doneIcon = c.toDataURL("image/png");
    } catch (e) { doneIcon = baseIcon; }
    return doneIcon;
  }

  function wakeBell() { if (bell && bell.state !== "running" && bell.resume) bell.resume(); }
  function disarmBell(delay) {
    doc.removeEventListener("pointerdown", wakeBell, true);
    doc.removeEventListener("keydown", wakeBell, true);
    var b = bell;
    bell = null;
    if (b) setTimeout(function () { try { b.close(); } catch (e) { /* already closed */ } }, delay || 0);
  }
  function armBell(endAt) {
    disarmBell(0);
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var b;
    try { b = new AC(); } catch (e) { return; }
    bell = b;
    // started by a click or E it runs at once; a sprint resumed after a reload
    // has no gesture yet, so the bell waits for the next touch of the page
    doc.addEventListener("pointerdown", wakeBell, true);
    doc.addEventListener("keydown", wakeBell, true);
    Promise.resolve(b.resume && b.resume()).then(function () {
      if (bell !== b || !sprint.end) return;
      doc.removeEventListener("pointerdown", wakeBell, true);
      doc.removeEventListener("keydown", wakeBell, true);
      var at = b.currentTime + Math.max(0, (endAt - Date.now()) / 1000);
      var first = null;
      [783.99, 1046.5].forEach(function (f, i) { // G5 then C6, soft and short
        var t = at + i * 0.14;
        var o = b.createOscillator(), g = b.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
        o.connect(g);
        g.connect(b.destination);
        o.start(t);
        o.stop(t + 0.9);
        first = first || o;
      });
      first.onended = function () { if (bell === b && sprint.end) stopSprint(true); };
    }).catch(function () { /* no audio: the timer still closes the sprint */ });
  }

  function sprintTick() {
    var left = sprint.end - Date.now();
    if (left <= 0) { stopSprint(true); return; }
    var s = Math.ceil(left / 1000);
    var text = pad(Math.floor(s / 60)) + ":" + pad(s % 60);
    if (hudTime.textContent !== text) {
      hudTime.textContent = text;
      doc.title = text + " · Cozy Cabin";
    }
  }

  function runSprint(end, len) {
    closeReceipt(false);
    sprint.end = end;
    sprint.len = len;
    saveSprint({ end: end, len: len });
    hud.classList.add("is-sprint");
    hud.setAttribute("data-icon", "sprint");
    hud.setAttribute("aria-label", "Quiet sprint running. Stop the sprint.");
    sprintBtn.classList.add("is-on");
    sprintBtn.setAttribute("aria-pressed", "true");
    sprintLabel.textContent = "Stop the sprint";
    sprintTick();
    clearInterval(sprint.timer);
    sprint.timer = setInterval(sprintTick, 250);
    armBell(end);
  }

  function startSprint() {
    runSprint(Date.now() + SPRINT_MS, SPRINT_MS);
    toast("Sprint started. " + lengthWords(SPRINT_MS) + ". The clock up top and this tab count it down, and a soft bell rings at the end.", 4600);
  }

  function stopSprint(finished) {
    if (!sprint.end) return;
    clearInterval(sprint.timer);
    sprint.end = 0;
    hud.classList.remove("is-sprint");
    sprintBtn.classList.remove("is-on");
    sprintBtn.setAttribute("aria-pressed", "false");
    sprintLabel.textContent = "Start a 25-minute sprint";
    if (finished) {
      disarmBell(1600); // let the second note finish
      showReceipt(sprint.len, Date.now());
    } else {
      disarmBell(0);
      saveSprint(null);
      doc.title = baseTitle;
      toast("Sprint stopped.");
      renderClock(true);
    }
  }

  function showReceipt(len, at) {
    sprint.done = true;
    saveSprint({ done: true, len: len, at: at });
    hud.classList.add("is-done");
    hud.setAttribute("data-icon", "sprint");
    hudTime.textContent = "Done";
    hud.setAttribute("aria-label", "Sprint done. Close the receipt.");
    doc.title = "Sprint done · Cozy Cabin";
    favicon.setAttribute("href", makeDoneIcon());
    $("[data-receipt-len]").textContent = lengthWords(len);
    receipt.hidden = false;
    // the receipt replaces any open toast; later toasts sit above its real height
    clearTimeout(toastTimer);
    toastEl.classList.remove("is-on");
    root.style.setProperty("--receipt-h", receipt.offsetHeight + "px");
    announce("Sprint done. " + lengthWords(len) + ". Wishlist Cozy Cabin on Steam from the receipt.");
  }

  function closeReceipt(paint) {
    if (!sprint.done) return;
    var hadFocus = receipt.contains(doc.activeElement);
    sprint.done = false;
    receipt.hidden = true;
    hud.classList.remove("is-done");
    doc.title = baseTitle;
    favicon.setAttribute("href", baseIcon);
    saveSprint(null);
    if (paint !== false) renderClock(true);
    if (hadFocus) hud.focus({ preventScroll: true });
  }

  // pick up where a reload left off
  function resumeSprint() {
    var s = loadSprint(), now = Date.now();
    if (!s) return;
    if (s.done) { if (now - s.at < RECEIPT_KEEP) showReceipt(s.len, s.at); else saveSprint(null); return; }
    if (s.end > now + 500) { runSprint(s.end, s.len); toast("Your sprint is still running."); }
    else if (now - s.end < RECEIPT_KEEP) showReceipt(s.len, s.end); // it finished while the page was closed
    else saveSprint(null);
  }

  sprintBtn.setAttribute("aria-pressed", "false");
  sprintBtn.addEventListener("click", function () { if (sprint.end) stopSprint(false); else startSprint(); });
  $("[data-receipt-close]").addEventListener("click", function () { closeReceipt(); });

  hud.addEventListener("click", function () {
    if (sprint.end) { stopSprint(false); return; }
    if (sprint.done) { closeReceipt(); return; }
    goRoom(0);
    setTimeout(function () { sprintBtn.focus({ preventScroll: true }); }, 900);
  });

  // ── rain: a pixel canvas over the bedroom, and a synthesized sound ─
  var rain = { cv: $(".rain"), ctx: null, w: 0, h: 0, drops: [], live: false, ratio: 0 };
  rain.ctx = rain.cv.getContext("2d");

  function sizeRain() {
    // one canvas pixel = three CSS pixels, close to the stills' own pixel size
    var w = Math.max(1, Math.round(rain.cv.clientWidth / 3));
    var h = Math.max(1, Math.round(rain.cv.clientHeight / 3));
    if (w === rain.w && h === rain.h) return;
    rain.w = rain.cv.width = w;
    rain.h = rain.cv.height = h;
    var n = Math.min(170, Math.round((w * h) / 210));
    rain.drops = [];
    for (var i = 0; i < n; i++) rain.drops.push(newDrop(true));
    drawRain(0);
  }

  function newDrop(anywhere) {
    return {
      x: Math.random() * (rain.w + 40) - 20,
      y: anywhere ? Math.random() * rain.h : -Math.random() * 30,
      len: 2 + Math.floor(Math.random() * 4),
      v: 70 + Math.random() * 60,           // canvas px per second
      a: 0.16 + Math.random() * 0.22
    };
  }

  function drawRain(dt) {
    var c = rain.ctx;
    c.clearRect(0, 0, rain.w, rain.h);
    for (var i = 0; i < rain.drops.length; i++) {
      var d = rain.drops[i];
      d.y += d.v * dt;
      d.x += d.v * dt * 0.12;
      if (d.y > rain.h) rain.drops[i] = d = newDrop(false);
      c.fillStyle = "rgba(206, 220, 242," + d.a + ")";
      c.fillRect(Math.round(d.x), Math.round(d.y), 1, d.len);
    }
  }

  function rainFrame(time, deltaTime) {
    if (!rain.live) return;
    drawRain(Math.min(deltaTime, 50) / 1000);
  }

  var rafId = 0, rafLast = 0;
  function rafLoop(t) {
    if (!rain.live) { rafId = 0; return; }
    rainFrame(t, rafLast ? t - rafLast : 16);
    rafLast = t;
    rafId = requestAnimationFrame(rafLoop);
  }

  function setRainLive(on) {
    on = on && !reduce;
    if (on === rain.live) return;
    rain.live = on;
    if (motion) {
      if (on) gsap.ticker.add(rainFrame); else gsap.ticker.remove(rainFrame);
    } else if (on && !rafId) {
      rafLast = 0;
      rafId = requestAnimationFrame(rafLoop);
    }
  }

  var sound = { ctx: null, master: null, on: false, sleep: 0 };
  var rainBtn = $("[data-rain]");
  var rainState = $("[data-rain-state]");

  function buildSound() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    var ctx = new AC();
    var rate = ctx.sampleRate;

    // body: brown noise, levelled so the loop point is seamless
    var len = rate * 6;
    var buf = ctx.createBuffer(1, len, rate);
    var d = buf.getChannelData(0);
    var last = 0, i;
    for (i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    var drift = d[len - 1] - d[0];
    for (i = 0; i < len; i++) d[i] -= drift * (i / (len - 1));
    var body = ctx.createBufferSource(); body.buffer = buf; body.loop = true;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 160;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1300;

    // hiss: white noise around 5 kHz, the drops on the glass
    var buf2 = ctx.createBuffer(1, rate * 2, rate);
    var d2 = buf2.getChannelData(0);
    for (i = 0; i < d2.length; i++) d2[i] = Math.random() * 2 - 1;
    var hiss = ctx.createBufferSource(); hiss.buffer = buf2; hiss.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 5200; bp.Q.value = 0.6;
    var hissGain = ctx.createGain(); hissGain.gain.value = 0.05;

    var master = ctx.createGain(); master.gain.value = 0;
    body.connect(hp); hp.connect(lp); lp.connect(master);
    hiss.connect(bp); bp.connect(hissGain); hissGain.connect(master);
    master.connect(ctx.destination);
    body.start(); hiss.start();
    sound.ctx = ctx;
    sound.master = master;
    return true;
  }

  // the rain belongs to the bedroom: its level follows how much of the night is on screen
  function levelSound() {
    if (!sound.ctx) return;
    var target = sound.on ? 0.5 * clamp(rain.ratio * 1.6, 0, 1) : 0;
    clearTimeout(sound.sleep);
    if (target > 0 && sound.ctx.state === "suspended") sound.ctx.resume();
    sound.master.gain.setTargetAtTime(target, sound.ctx.currentTime, 0.3);
    if (target === 0) sound.sleep = setTimeout(function () { if (sound.ctx.state === "running") sound.ctx.suspend(); }, 1600);
  }

  rainBtn.addEventListener("click", function () {
    if (!sound.ctx && !buildSound()) { toast("This browser can't play the rain."); return; }
    sound.on = !sound.on;
    rainBtn.setAttribute("aria-pressed", String(sound.on));
    rainState.textContent = sound.on ? "on" : "off";
    levelSound();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        rain.ratio = e.isIntersecting ? e.intersectionRatio : 0;
        setRainLive(e.isIntersecting);
        levelSound();
      });
    }, { threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] }).observe(night);
  }
  doc.addEventListener("visibilitychange", function () {
    if (!doc.hidden && sprint.end) sprintTick(); // catch up after a throttled background stretch
    if (doc.hidden) setRainLive(false);
    else if (rain.ratio > 0) setRainLive(true);
  });

  // ── the game's keys ────────────────────────────────────────
  var KEYS_STORE = "pixbi-cabin-keys";
  var keysOn = true;
  try { keysOn = localStorage.getItem(KEYS_STORE) !== "off"; } catch (e) { /* storage blocked: keys stay on */ }
  var keysToggle = $("[data-keys-toggle]");
  function paintKeysToggle() {
    keysToggle.setAttribute("aria-pressed", String(keysOn));
    keysToggle.querySelector("b").textContent = keysOn ? "on" : "off";
  }
  paintKeysToggle();
  keysToggle.addEventListener("click", function () {
    keysOn = !keysOn;
    paintKeysToggle();
    try { localStorage.setItem(KEYS_STORE, keysOn ? "on" : "off"); } catch (e) { /* not remembered */ }
    toast(keysOn ? "Keys on. W and S move between rooms of this page, A and D walk, E uses things." : "Keys off. The page scrolls as usual.");
  });

  function pressCaps(k, down) {
    $$('kbd[data-key="' + k + '"]').forEach(function (el) { el.classList.toggle("is-down", down); });
  }
  function releaseAll() { $$("kbd.is-down").forEach(function (el) { el.classList.remove("is-down"); }); }

  function currentBlock() {
    var line = window.scrollY + M.hh + 4, idx = 0;
    var list = M.blocks.filter(function (b) { return b.el.tagName === "SECTION"; });
    for (var i = 0; i < list.length; i++) if (list[i].top <= line) idx = i;
    return { list: list, idx: idx };
  }

  function goBlock(dir) {
    var c = currentBlock(), list = c.list, i = c.idx;
    var top = function (b) { return b.id === "title" ? 0 : b.top - M.hh; };
    if (dir < 0 && window.scrollY > top(list[i]) + 40) return scrollToY(top(list[i]));
    var next = list[clamp(i + dir, 0, list.length - 1)];
    scrollToY(top(next));
  }

  function walkInView() {
    var r = boxOf(walk).getBoundingClientRect();
    return r.top < M.vh * 0.5 && r.bottom > M.vh * 0.5;
  }

  function roomNow() {
    if (walkST) return Math.round(walkST.progress * (rooms.length - 1));
    var best = 0, bestD = Infinity;
    rooms.forEach(function (room, i) {
      var r = room.getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - M.vh / 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function goRoom(i) {
    i = clamp(i, 0, rooms.length - 1);
    if (walkST) scrollToY(walkST.start + (i / (rooms.length - 1)) * (walkST.end - walkST.start));
    else scrollToY(rooms[i].getBoundingClientRect().top + window.scrollY - M.hh - 27);
  }

  function interact() {
    var cx = window.innerWidth / 2, cy = M.vh / 2, pick = null, pickD = Infinity;
    $$("[data-interact]").forEach(function (btn) {
      var zone = btn.closest(".room, .night");
      if (walkST && zone.classList.contains("room") && !zone.classList.contains("is-active")) return;
      var r = zone.getBoundingClientRect();
      var visW = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      var visH = Math.min(r.bottom, M.vh) - Math.max(r.top, M.hh);
      if (visW <= 0 || visH < Math.min(r.height, M.vh) * 0.35) return;
      var d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < pickD) { pickD = d; pick = btn; }
    });
    if (!pick) { toast("Nothing to use here. Try E in the work room, or at night."); return; }
    pick.classList.add("is-pressed");
    setTimeout(function () { pick.classList.remove("is-pressed"); }, 140);
    pick.click();
  }

  doc.addEventListener("keydown", function (e) {
    if (!keysOn || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var k = (e.key || "").toLowerCase();
    if (k === "arrowleft" || k === "arrowright") {
      if (!walkST || !walkInView()) return;
      e.preventDefault();
      if (!e.repeat) goRoom(roomNow() + (k === "arrowleft" ? -1 : 1));
      return;
    }
    if (k.length !== 1 || "wasde".indexOf(k) < 0) return;
    pressCaps(k, true);
    if (e.repeat) return;
    if (k === "w") goBlock(-1);
    else if (k === "s") goBlock(1);
    else if (k === "a" || k === "d") { if (walkInView()) goRoom(roomNow() + (k === "a" ? -1 : 1)); }
    else if (k === "e") interact();
  });
  doc.addEventListener("keyup", function (e) { pressCaps((e.key || "").toLowerCase(), false); });
  window.addEventListener("blur", releaseAll);

  // ── in-page navigation ─────────────────────────────────────
  $$("[data-nav]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1);
      var target = doc.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var y = id === "title" ? 0 : boxOf(target).getBoundingClientRect().top + window.scrollY - M.hh;
      scrollToY(y);
      var heading = target.querySelector("h1, h2");
      if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
    });
  });

  $("[data-demo]").addEventListener("click", function () {
    toast("The demo isn't out yet. Wishlist on Steam to hear when it lands.");
  });

  function setActiveRoom(i) {
    rooms.forEach(function (room, j) { room.classList.toggle("is-active", j === i); });
    $("[data-room-now]").textContent = pad(i + 1);
  }

  // ── motion ─────────────────────────────────────────────────
  function lines(el) { return $$(".ln > span", el); }

  function buildMotion() {
    gsap.registerPlugin(ST);

    lenis = window.Lenis ? new window.Lenis({ duration: 1.1, smoothWheel: true }) : null;
    if (lenis) {
      lenis.on("scroll", ST.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    // starting states, then hand over from the CSS guard
    var fades = $$("[data-fade]");
    var pixels = $$("[data-pixel-in]");
    // y: 0 clears the px offset GSAP parses from the CSS guard's translateY(110%)
    gsap.set($$("[data-lines] .ln > span"), { y: 0, yPercent: 110 });
    gsap.set(fades, { opacity: 0, y: 18 });
    gsap.set(pixels, { clipPath: "inset(50% 50% 50% 50%)" });
    gsap.set(header, { opacity: 0 });
    gsap.set(".sticky", { opacity: 0, y: -18, rotation: 14 });
    root.classList.remove("motion");

    // entry: the title sets, the screen switches on in pixel steps, the note lands
    var hero = $(".hero");
    gsap.timeline({ defaults: { ease: "expo.out" } })
      .to(header, { opacity: 1, duration: 0.5, ease: "power1.out" }, 0)
      .to(lines($("h1")), { yPercent: 0, duration: 1, stagger: 0.12 }, 0.1)
      .to($$("[data-pixel-in]", hero), { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "steps(7)" }, 0.25)
      .to($$("[data-fade]", hero), { opacity: 1, y: 0, duration: 0.7, stagger: 0.07, ease: "power1.out" }, 0.4)
      .to(".sticky", { opacity: 1, y: 0, rotation: 6, duration: 0.6 }, 0.85);

    // statements rise once; quiet text fades once
    $$("[data-lines]").forEach(function (el) {
      if (hero.contains(el)) return;
      ST.create({ trigger: el, start: "top 86%", once: true, onEnter: function () {
        gsap.to(lines(el), { yPercent: 0, duration: 1, stagger: 0.1, ease: "expo.out" });
      } });
    });
    fades.forEach(function (el) {
      if (hero.contains(el)) return;
      ST.create({ trigger: el, start: "top 92%", once: true, onEnter: function () {
        gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: "power1.out" });
      } });
    });

    // screens switch on in pixel steps (rooms switch on together as the walk arrives)
    var cabinShot = $(".cabin-shot");
    ST.create({ trigger: cabinShot, start: "top 85%", once: true, onEnter: function () {
      gsap.to(cabinShot, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "steps(7)" });
    } });
    ST.create({ trigger: walk, start: "top 70%", once: true, onEnter: function () {
      gsap.to($$(".room-shot"), { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "steps(7)", stagger: 0.14 });
    } });

    // the bedroom drifts behind its frame
    gsap.fromTo(".night-still", { yPercent: -4, scale: 1.2 }, {
      yPercent: 4, scale: 1.2, ease: "none",
      scrollTrigger: { trigger: night, start: "top bottom", end: "bottom top", scrub: true }
    });

    var mm = gsap.matchMedia();
    mm.add({ wide: "(min-width: 861px)", narrow: "(max-width: 860px)" }, function (ctx) {
      var wide = ctx.conditions.wide;
      buildClutter(wide);
      if (wide) buildWalk();
      return function () { walkST = null; walk.classList.remove("is-pinned"); setActiveRoom(0); };
    });
  }

  // the usual setup closes window by window as the working day passes; scroll back and it reopens
  function buildClutter(wide) {
    var card = $("[data-clutter]");
    var wins = $$("[data-win]", card).reverse(); // top-most first
    var chips = $$("[data-chip]", card).reverse();
    var openEl = $("[data-open]", card), wordEl = $("[data-open-word]", card);
    var shown = 4;
    var tl = gsap.timeline({
      scrollTrigger: { trigger: card, start: "top 72%", end: wide ? "center 38%" : "bottom 55%", scrub: true },
      onUpdate: function () {
        var open = 4 - clamp(Math.floor(tl.time() + 0.001), 0, 4);
        if (open === shown) return;
        shown = open;
        openEl.textContent = open;
        wordEl.textContent = open === 1 ? "window" : "windows";
      }
    });
    wins.forEach(function (win, j) {
      tl.to($(".win-body", win), { scaleY: 0, opacity: 0, duration: 0.55, ease: "none" }, j)
        .to(win, { y: 18, opacity: 0, duration: 0.45, ease: "none" }, j + 0.55)
        .to(chips[j], { opacity: 0, scale: 0.7, duration: 0.3, ease: "none" }, j + 0.7);
    });
    tl.to($(".desk-clear", card), { opacity: 1, duration: 0.4, ease: "none" }, 4);
  }

  function buildWalk() {
    var track = $(".walk-track");
    var vp = $(".walk-viewport");
    walk.classList.add("is-pinned");
    var dist = function () { return Math.max(0, track.scrollWidth - vp.clientWidth); };
    var tween = gsap.to(track, {
      x: function () { return -dist(); },
      ease: "none",
      scrollTrigger: {
        trigger: walk,
        start: "top top",
        end: function () { return "+=" + dist(); },
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: function (self) { setActiveRoom(Math.round(self.progress * (rooms.length - 1))); }
      }
    });
    walkST = tween.scrollTrigger;
  }

  // ── boot ───────────────────────────────────────────────────
  window.__pixReady = true;
  if (motion) {
    buildMotion();
    ST.addEventListener("refresh", function () { measure(); onScroll(); });
  } else {
    root.classList.remove("motion");
  }

  measure();
  renderClock(true);
  resumeSprint();
  onScroll();
  sizeRain();
  if (reduce) drawRain(0);

  window.addEventListener("scroll", onScroll, { passive: true });
  var resizeT = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { sizeRain(); if (!motion) { measure(); onScroll(); } }, 120);
  });
  function settle() { if (motion) ST.refresh(); else { measure(); onScroll(); } }
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(settle);
  window.addEventListener("load", settle);
})();
