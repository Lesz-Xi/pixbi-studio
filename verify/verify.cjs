/* Verify pixbistudio-standalone.html over file:// — screenshots, console audit and
   behaviour assertions (clock anchors, game keys, sprint, clutter card, walk, rain).
   Desktop + mobile + reduced-motion + no-JS runs.
   Usage: node verify/verify.cjs  (exit 1 on any failure) */
const path = require("path");
const fs = require("fs");
const os = require("os");
const puppeteer = require("puppeteer-core");

// Chrome: $CHROME_PATH, else the newest Chrome for Testing in puppeteer's cache
const CHROME_ROOT = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
const DIR = path.resolve(__dirname, "..");
const FILE = "file://" + path.join(DIR, "pixbistudio-standalone.html");
const OUT = path.join(DIR, "verify", "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const dirs = fs.readdirSync(CHROME_ROOT).filter((d) => d.startsWith("mac_arm-")).sort();
  const latest = dirs[dirs.length - 1];
  return path.join(CHROME_ROOT, latest, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath(),
    args: ["--allow-file-access-from-files", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  const errors = [];
  const notes = [];
  const assert = (cond, msg, ctx) => (cond ? notes : errors).push(`${cond ? "ok " : "ASSERT"} [${ctx}] ${msg}`);

  async function open(ctx, viewport, opts = {}) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    if (opts.reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    if (opts.noJs) await page.setJavaScriptEnabled(false);
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()} [${ctx}] ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror [${ctx}] ${e.message}`));
    page.on("requestfailed", (r) => errors.push(`requestfailed [${ctx}] ${r.url().slice(0, 80)}`));
    page.on("request", (r) => { const u = r.url(); if (!u.startsWith("file:") && !u.startsWith("data:")) errors.push(`remote request [${ctx}] ${u.slice(0, 80)}`); });
    if (opts.before) await opts.before(page);
    await page.goto(FILE + (opts.query || ""), { waitUntil: "load" });
    await sleep(opts.noJs ? 300 : 1800);
    return page;
  }
  const scroll = async (page, y, wait = 900) => { await page.evaluate((y) => window.scrollTo(0, y), y); await sleep(wait); };
  const hud = (page) => page.$eval("[data-hud-time]", (el) => el.textContent.trim());
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });

  // ── desktop ────────────────────────────────────────────────
  {
    const ctx = "desktop";
    const page = await open(ctx, { width: 1440, height: 900, deviceScaleFactor: 1 });
    await shot(page, "d-01-hero");
    assert((await hud(page)) === "09:27 AM", "clock starts at 09:27 AM (" + (await hud(page)) + ")", ctx);
    const heroState = await page.evaluate(() => ({
      h1: getComputedStyle(document.querySelector("h1 .ln > span")).transform,
      shot: getComputedStyle(document.querySelector(".capsule-screen")).clipPath,
      motionClass: document.documentElement.classList.contains("motion"),
    }));
    assert(heroState.h1 === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(heroState.h1), "hero title has landed", ctx);
    assert(/inset\(0(%|px)?\)|none/.test(heroState.shot), "capsule screen fully switched on (" + heroState.shot + ")", ctx);
    assert(!heroState.motionClass, "motion guard handed over", ctx);

    // clutter card: start open, end closed
    const cardTop = await page.$eval("[data-clutter]", (el) => el.getBoundingClientRect().top + scrollY);
    await scroll(page, cardTop - 900 * 0.72 + 2);
    assert((await page.$eval("[data-open]", (el) => el.textContent)) === "4", "four windows open as the card arrives", ctx);
    await scroll(page, cardTop - 900 * 0.4, 700);
    await shot(page, "d-02-clutter-mid");
    await scroll(page, cardTop + 120, 1000);
    await shot(page, "d-03-clutter-end");
    assert((await page.$eval("[data-open]", (el) => el.textContent)) === "0", "all windows closed by the end of the scrub", ctx);

    // walk: pinned, clock reads each still's own time
    const st = await page.evaluate(() => {
      const t = ScrollTrigger.getAll().find((s) => s.pin && s.pin.classList.contains("walk"));
      return t ? { start: t.start, end: t.end } : null;
    });
    assert(!!st, "the walk pins on desktop", ctx);
    if (st) {
      const times = ["06:57 PM", "07:11 PM", "07:18 PM"];
      for (let i = 0; i < 3; i++) {
        await scroll(page, st.start + (i / 2) * (st.end - st.start), 1100);
        await shot(page, "d-04-room-" + (i + 1));
        assert((await hud(page)) === times[i], `room ${i + 1} clock ${times[i]} (got ${await hud(page)})`, ctx);
        const active = await page.$$eval(".room", (els) => els.findIndex((e) => e.classList.contains("is-active")));
        assert(active === i, `room ${i + 1} is the active room`, ctx);
      }
      // keys: D walks back? A walks to the previous room
      await page.keyboard.press("a");
      await sleep(1500);
      const active = await page.$$eval(".room", (els) => els.findIndex((e) => e.classList.contains("is-active")));
      assert(active === 1, "A walks to the previous room (active " + active + ")", ctx);
      await page.keyboard.press("a");
      await sleep(1500);
      // E in the work room starts the sprint
      await page.keyboard.press("e");
      await sleep(600);
      const sprint = await page.evaluate(() => ({ hud: document.querySelector("[data-hud-time]").textContent, title: document.title, cls: document.querySelector("[data-hud]").className }));
      assert(/^2[45]:\d\d$/.test(sprint.hud) && /is-sprint/.test(sprint.cls), "E in the work room starts a 25-minute sprint (" + sprint.hud + ")", ctx);
      assert(/^2[45]:\d\d · Cozy Cabin$/.test(sprint.title), "the tab title counts the sprint", ctx);
      await shot(page, "d-05-sprint");
      await page.click("[data-hud]");
      await sleep(400);
      assert(!(await page.$eval("[data-hud]", (el) => el.classList.contains("is-sprint"))), "clicking the clock stops the sprint", ctx);
    }

    // night: rain draws, clock is night
    const nightTop = await page.$eval(".night", (el) => el.getBoundingClientRect().top + scrollY);
    await scroll(page, nightTop, 1200);
    await shot(page, "d-06-night");
    const rainPixels = await page.evaluate(() => {
      const c = document.querySelector(".rain"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n;
    });
    assert(rainPixels > 50, "rain is drawing (" + rainPixels + " px)", ctx);
    assert(/PM$/.test(await hud(page)) && (await page.$eval("[data-hud]", (el) => el.dataset.icon)) === "moon", "night clock shows the moon", ctx);
    assert((await page.evaluate(() => document.documentElement.dataset.tone)) === "night", "header tone is night", ctx);
    await page.keyboard.press("e");
    await sleep(300);
    assert((await page.$eval("[data-rain]", (el) => el.getAttribute("aria-pressed"))) === "true", "E at night turns the rain sound on", ctx);

    // S moves to the next block
    const y0 = await page.evaluate(() => scrollY);
    await page.keyboard.press("s");
    await sleep(1500);
    assert((await page.evaluate(() => scrollY)) > y0 + 200, "S moves down a room of the page", ctx);
    await shot(page, "d-07-studio");
    await scroll(page, 99999, 1000);
    await shot(page, "d-08-contact");
    const stuck = await page.evaluate(() => [...document.querySelectorAll(".ln > span")].filter((e) => {
      const t = getComputedStyle(e).transform; return t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)";
    }).map((e) => e.textContent));
    assert(stuck.length === 0, "every headline line has landed (" + stuck.join(" / ") + ")", ctx);

    // keys off: S does nothing
    await scroll(page, 0, 800);
    await page.click("[data-keys-toggle]");
    await page.keyboard.press("s");
    await sleep(900);
    assert((await page.evaluate(() => scrollY)) < 5, "keys off leaves the page alone", ctx);
    await page.click("[data-keys-toggle]");

    // full-page overview
    await page.close();
  }

  // ── the two hero buttons sit fully above the fold on common desktop heights ─
  for (const vp of [{ width: 1440, height: 900 }, { width: 1480, height: 830 }, { width: 1366, height: 768 }]) {
    const ctx = `fold ${vp.width}x${vp.height}`;
    const page = await open(ctx, vp);
    const r = await page.evaluate(() => {
      const b = document.querySelector(".hero .actions").getBoundingClientRect();
      return { bottom: Math.round(b.bottom + 4), vh: innerHeight }; // +4: the pressable shadow
    });
    assert(r.bottom <= r.vh, `hero buttons above the fold (bottom ${r.bottom} / ${r.vh})`, ctx);
    await shot(page, `f-${vp.width}x${vp.height}`);
    await page.close();
  }

  // ── the end of a sprint (run fast: ?sprint=4) ──────────────
  {
    const ctx = "sprint end";
    const spy = (page) => page.evaluateOnNewDocument(() => {
      window.__osc = [];
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (when) { window.__osc.push((when || 0) - this.context.currentTime); return start.apply(this, arguments); };
    });
    const page = await open(ctx, { width: 1440, height: 900 }, { query: "?sprint=4", before: spy });
    const icon0 = await page.$eval('link[rel="icon"]', (el) => el.href);
    const title0 = await page.title();
    const st = await page.evaluate(() => ScrollTrigger.getAll().find((s) => s.pin).start);
    await scroll(page, st, 1100);
    await page.click("[data-sprint]");
    await sleep(500);
    const osc = await page.evaluate(() => window.__osc);
    assert(osc.length === 2 && Math.abs(osc[0] - 4) < 0.6, "the bell is scheduled on the audio clock for the end (" + osc.map((n) => n.toFixed(2)).join(", ") + " s ahead)", ctx);
    await sleep(5200);
    const done = await page.evaluate(() => ({
      receipt: !document.querySelector("[data-receipt]").hidden,
      steam: !!document.querySelector("[data-receipt] a[href*='store.steampowered.com']"),
      len: document.querySelector("[data-receipt-len]").textContent,
      title: document.title,
      icon: document.querySelector('link[rel="icon"]').href,
      hud: document.querySelector("[data-hud-time]").textContent,
      stored: JSON.parse(localStorage.getItem("pixbi-cabin-sprint") || "null"),
    }));
    assert(done.receipt && done.steam, "the receipt opens with the Wishlist button", ctx);
    assert(done.len === "4 seconds", "the receipt names the sprint's length (" + done.len + ")", ctx);
    assert(done.title === "Sprint done · Cozy Cabin" && done.hud === "Done", "tab title and clock say done", ctx);
    assert(done.icon.startsWith("data:image/png") && done.icon !== icon0, "the tab icon turns to the done mark", ctx);
    assert(done.stored && done.stored.done, "the finished sprint is remembered", ctx);
    await shot(page, "s-01-receipt");

    await page.reload({ waitUntil: "load" });
    await sleep(1500);
    assert(!(await page.$eval("[data-receipt]", (el) => el.hidden)), "the receipt survives a reload", ctx);
    await page.click("[data-receipt-close]");
    await sleep(300);
    const closed = await page.evaluate(() => ({
      hidden: document.querySelector("[data-receipt]").hidden,
      title: document.title,
      icon: document.querySelector('link[rel="icon"]').href,
      hud: document.querySelector("[data-hud-time]").textContent,
      stored: localStorage.getItem("pixbi-cabin-sprint"),
    }));
    assert(closed.hidden && closed.title === title0 && closed.icon === icon0 && /[AP]M$/.test(closed.hud) && !closed.stored, "closing restores title, icon and clock and forgets the sprint", ctx);
    await page.close();

    // a running sprint carries on through a reload
    const p2 = await open("sprint reload", { width: 1440, height: 900 }, { query: "?sprint=60" });
    const st2 = await p2.evaluate(() => ScrollTrigger.getAll().find((s) => s.pin).start);
    await scroll(p2, st2, 1100);
    await p2.click("[data-sprint]");
    await sleep(2200);
    await p2.reload({ waitUntil: "load" });
    await sleep(1200);
    const run = await p2.evaluate(() => ({
      hud: document.querySelector("[data-hud-time]").textContent,
      on: document.querySelector("[data-hud]").classList.contains("is-sprint"),
      pressed: document.querySelector("[data-sprint]").getAttribute("aria-pressed"),
    }));
    assert(run.on && /^00:5[5-8]$/.test(run.hud) && run.pressed === "true", "a running sprint resumes after a reload (" + run.hud + ")", "sprint reload");
    await p2.click("[data-hud]");
    await sleep(300);
    assert(!(await p2.evaluate(() => localStorage.getItem("pixbi-cabin-sprint"))), "stopping forgets it", "sprint reload");
    await p2.close();

    // timers frozen (as in a long-hidden tab): the bell alone closes the sprint
    const freeze = (page) => page.evaluateOnNewDocument(() => { window.setInterval = () => 0; });
    const p4 = await open("sprint frozen timers", { width: 1440, height: 900 }, { query: "?sprint=3", before: freeze });
    const st4 = await p4.evaluate(() => ScrollTrigger.getAll().find((s) => s.pin).start);
    await scroll(p4, st4, 1100);
    await p4.click("[data-sprint]");
    await sleep(4800);
    assert(!(await p4.$eval("[data-receipt]", (el) => el.hidden)), "with timers frozen, the bell's end still closes the sprint", "sprint frozen timers");
    await p4.evaluate(() => localStorage.removeItem("pixbi-cabin-sprint"));
    await p4.close();

    // phone receipt
    const p3 = await open("sprint phone", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { query: "?sprint=3" });
    await p3.$eval("[data-sprint]", (el) => el.scrollIntoView({ block: "center" }));
    await sleep(600);
    await p3.tap("[data-sprint]");
    await sleep(4500);
    await shot(p3, "s-02-receipt-phone");
    const fits = await p3.$eval("[data-receipt]", (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && !el.hidden; });
    assert(fits, "the receipt fits a phone screen", "sprint phone");
    await p3.evaluate(() => localStorage.removeItem("pixbi-cabin-sprint"));
    await p3.close();
  }

  // ── mobile ─────────────────────────────────────────────────
  {
    const ctx = "mobile";
    const page = await open(ctx, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await shot(page, "m-01-hero");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 0, "no sideways scroll (" + overflow + ")", ctx);
    const pinned = await page.evaluate(() => ScrollTrigger.getAll().some((s) => s.pin));
    assert(!pinned, "no pin on phones", ctx);
    for (const [sel, name] of [["[data-clutter]", "m-02-clutter"], [".walk", "m-03-walk"], [".room:nth-child(1)", "m-04-room"], [".night", "m-05-night"], [".contact", "m-06-contact"]]) {
      const y = await page.$eval(sel, (el) => el.getBoundingClientRect().top + scrollY - 80);
      await scroll(page, y, 1000);
      await shot(page, name);
    }
    await page.close();
  }

  // ── reduced motion ─────────────────────────────────────────
  {
    const ctx = "reduced";
    const page = await open(ctx, { width: 1440, height: 900 }, { reduced: true });
    const state = await page.evaluate(() => ({
      lenis: document.documentElement.classList.contains("lenis"),
      pinned: ScrollTrigger.getAll().length,
      hiddenFades: [...document.querySelectorAll("[data-fade]")].filter((e) => getComputedStyle(e).opacity !== "1").length,
      clipped: [...document.querySelectorAll("[data-pixel-in]")].filter((e) => getComputedStyle(e).clipPath !== "none").length,
    }));
    assert(!state.lenis && state.pinned === 0, "no smoothing and no scroll triggers", ctx);
    assert(state.hiddenFades === 0 && state.clipped === 0, "every block visible at once", ctx);
    const cy = await page.$eval(".compare", (el) => el.getBoundingClientRect().top + scrollY - 140);
    await scroll(page, cy, 300);
    await shot(page, "r-00-clutter-rest");
    const y = await page.$eval(".walk", (el) => el.getBoundingClientRect().top + scrollY + 400);
    await scroll(page, y, 300);
    await shot(page, "r-01-walk");
    await page.close();
  }

  // ── no JS ──────────────────────────────────────────────────
  {
    const ctx = "nojs";
    const page = await open(ctx, { width: 1440, height: 900 }, { noJs: true });
    const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-fade], .ln > span, [data-pixel-in]")].filter((e) => {
      const s = getComputedStyle(e); return s.opacity !== "1" || (s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)") || s.clipPath !== "none";
    }).length);
    assert(hidden === 0, "without JS nothing is hidden (" + hidden + ")", ctx);
    await shot(page, "n-01-hero");
    await page.close();
  }

  await browser.close();
  console.log(notes.join("\n"));
  if (errors.length) { console.log("\n" + errors.join("\n")); process.exit(1); }
  console.log("\nall checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
