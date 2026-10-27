const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../league-background.js"), "utf8");
const TIMER = "leagueFreeTimer";

function harness(saved = {}) {
  let now = Date.UTC(2026, 9, 27, 12);
  let listener;
  const data = structuredClone(saved);
  const browser = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: (callback) => { listener = callback; } }
    },
    storage: { local: {
      async get(key) { return key in data ? { [key]: structuredClone(data[key]) } : {}; },
      async set(values) { Object.assign(data, structuredClone(values)); },
      async remove(key) { delete data[key]; }
    } }
  };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { browser, Date: Clock });
  return {
    data,
    now: () => now,
    advance: (ms) => { now += ms; },
    send: (action, payload = {}) => listener({ type: "league-free", action, ...payload }, { id: browser.runtime.id })
  };
}

test("first open initializes once; concurrent tabs and restart retain elapsed time", async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.send("get"), h.send("get")]);
  assert.equal(a.timer.since, b.timer.since);
  h.advance(3 * 86400000);
  assert.equal((await h.send("get")).timer.since, a.timer.since);
  const restarted = harness(h.data);
  assert.equal((await restarted.send("get")).timer.since, a.timer.since);
});

test("manual reset and date validation preserve the last valid timestamp", async () => {
  const h = harness();
  const since = h.now() - 3600000;
  assert.equal((await h.send("setSince", { since })).timer.since, since);
  for (const invalid of [NaN, null, "yesterday", -1, h.now() + 60000]) {
    assert.equal((await h.send("setSince", { since: invalid })).ok, false);
  }
  assert.equal(h.data[TIMER].since, since);
  assert.equal((await h.send("setSince", { since: h.now() })).timer.since, h.now());
});

test("concurrent updates from multiple tabs keep the last saved date", async () => {
  const h = harness();
  const first = h.now() - 7200000;
  const second = h.now() - 3600000;
  await Promise.all([h.send("setSince", { since: first }), h.send("setSince", { since: second })]);
  assert.equal((await h.send("get")).timer.since, second);
});

test("upgrade deletes obsolete connection data and keeps the existing timer", async () => {
  const since = Date.UTC(2026, 9, 26, 11);
  const h = harness({
    leagueFreeConnection: { secret: "obsolete-local-secret" },
    [TIMER]: { since, inGame: false, source: "manual", error: "old error", checkedAt: since }
  });
  const reply = await h.send("get");
  assert.equal(reply.timer.since, since);
  assert.deepEqual(h.data[TIMER], { since });
  assert.equal(h.data.leagueFreeConnection, undefined);
  assert.deepEqual(Object.keys(reply).sort(), ["ok", "timer"]);
});

test("a previously paused timer starts locally from the upgrade time", async () => {
  const h = harness({ [TIMER]: { since: Date.UTC(2026, 9, 26), inGame: true } });
  assert.equal((await h.send("get")).timer.since, h.now());
  h.advance(60000);
  assert.equal((await h.send("get")).timer.since, h.now() - 60000);
});

test("unsupported actions leave the saved timer unchanged", async () => {
  const h = harness();
  const first = await h.send("get");
  assert.equal((await h.send("unknown")).ok, false);
  assert.equal((await h.send("get")).timer.since, first.timer.since);
});
