/* One local writer keeps the timer consistent across multiple new tabs. */
(() => {
  "use strict";

  const extension = typeof browser !== "undefined" ? browser : chrome;
  const storage = extension.storage.local;
  const TIMER_KEY = "leagueFreeTimer";
  let queue = Promise.resolve();

  function serial(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  async function readTimer() {
    const saved = await storage.get(TIMER_KEY);
    const previous = saved[TIMER_KEY];
    const since = Number.isFinite(previous?.since) && previous.since > 0 && previous.inGame !== true
      ? previous.since : Date.now();
    const timer = { since };
    if (!previous || previous.since !== since || Object.keys(previous).length !== 1) {
      await storage.set({ [TIMER_KEY]: timer });
    }
    return timer;
  }

  async function handle(message) {
    if (message.action === "get") return { timer: await readTimer() };
    if (message.action === "setSince") {
      const since = message.since;
      if (!Number.isFinite(since) || since <= 0 || since > Date.now()) {
        throw new Error("Bitte ein gültiges Datum in der Vergangenheit auswählen.");
      }
      const timer = { since };
      await storage.set({ [TIMER_KEY]: timer });
      return { timer };
    }
    throw new Error("Unbekannte Timer-Aktion.");
  }

  // Delete obsolete connection data when upgrading to the local timer.
  async function migrateSavedData() {
    await storage.remove("leagueFreeConnection");
    const saved = await storage.get(TIMER_KEY);
    if (saved[TIMER_KEY]) await readTimer();
  }
  queue = migrateSavedData().catch(() => {});

  extension.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== "league-free" || sender.id !== extension.runtime.id) return undefined;
    return serial(() => handle(message)).then(
      (data) => ({ ok: true, ...data }),
      (error) => ({ ok: false, error: error.message })
    );
  });
})();
