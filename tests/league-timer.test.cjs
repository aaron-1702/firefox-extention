const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../league-timer.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../newtab.html"), "utf8");

function ui(timer, { error = null } = {}) {
  let now = Date.UTC(2026, 9, 27, 12);
  let tick;
  let storageChange;
  const calls = [];
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], {
    value: "", textContent: "", dataset: {}, events: {},
    addEventListener(name, handler) { this.events[name] = handler; },
    setAttribute(name, value) { this[name] = value; },
    querySelectorAll() { return []; }
  }]));
  let snapshot = { ok: true, timer: structuredClone(timer) };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, {
    Date: Clock,
    document: {
      getElementById(id) {
        assert.ok(elements.has(id), `Missing HTML element: ${id}`);
        return elements.get(id);
      },
      addEventListener() {}
    },
    window: { setInterval(callback) { tick = callback; } },
    browser: {
      runtime: { async sendMessage(message) {
        calls.push(message);
        if (error) return { ok: false, error };
        if (message.action === "setSince") snapshot = { ok: true, timer: { since: message.since } };
        return snapshot;
      } },
      storage: { onChanged: { addListener(callback) { storageChange = callback; } } }
    }
  });
  return {
    calls,
    el: (id) => elements.get(id),
    flush: () => new Promise(setImmediate),
    advance(ms) { now += ms; tick(); },
    update(timer) {
      snapshot = { ok: true, timer };
      storageChange({ leagueFreeTimer: { newValue: timer } }, "local");
    }
  };
}

test("counter shows days and HH:MM:SS and catches up after sleep", async () => {
  const h = ui({ since: Date.UTC(2026, 9, 26, 10, 56, 56) });
  await h.flush();
  assert.equal(h.el("leagueDays").textContent, "1 Tag");
  assert.equal(h.el("leagueTimer").textContent, "01:03:04");
  h.advance(86400000 + 56000);
  assert.equal(h.el("leagueDays").textContent, "2 Tage");
  assert.equal(h.el("leagueTimer").textContent, "01:04:00");
});

test("a timestamp changed in another tab updates immediately", async () => {
  const h = ui({ since: Date.UTC(2026, 9, 26) });
  await h.flush();
  h.update({ since: Date.UTC(2026, 9, 27, 11) });
  assert.equal(h.el("leagueDays").textContent, "0 Tage");
  assert.equal(h.el("leagueTimer").textContent, "01:00:00");
});

test("clock moving backwards does not produce a negative timer", async () => {
  const h = ui({ since: Date.UTC(2026, 9, 28) });
  await h.flush();
  assert.equal(h.el("leagueDays").textContent, "0 Tage");
  assert.equal(h.el("leagueTimer").textContent, "00:00:00");
});

test("a manually chosen date is saved and displayed", async () => {
  const h = ui({ since: Date.UTC(2026, 9, 26) });
  await h.flush();
  h.el("leagueLastPlayed").value = "2026-10-25T12:00";
  h.el("leagueDateForm").events.submit({ preventDefault() {} });
  await h.flush();
  assert.equal(h.calls.at(-1).since, new Date("2026-10-25T12:00").getTime());
  assert.match(h.el("leagueSince").textContent, /25\.10\.2026/);
});

test("initial storage failure is visible", async () => {
  const h = ui({ since: Date.UTC(2026, 9, 26) }, { error: "Speichern fehlgeschlagen." });
  await h.flush();
  assert.equal(h.el("leagueStatus").hidden, false);
  assert.equal(h.el("leagueStatus").dataset.error, "true");
  assert.match(h.el("leagueStatus").textContent, /Speichern fehlgeschlagen/);
});
