(() => {
  "use strict";

  const extension = typeof browser !== "undefined" ? browser : chrome;
  const element = (id) => document.getElementById(id);
  let current = null;
  let busy = false;
  let notice = "";

  function localDateTime(timestamp) {
    const date = new Date(timestamp);
    const local = new Date(timestamp - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function renderCounter() {
    if (!current) return;
    const seconds = Math.max(0, Math.floor((Date.now() - current.since) / 1000));
    const days = Math.floor(seconds / 86400);
    const time = [Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
      .map((part) => String(part).padStart(2, "0")).join(":");
    element("leagueDays").textContent = `${days} ${days === 1 ? "Tag" : "Tage"}`;
    element("leagueTimer").textContent = time;
  }

  function render() {
    if (current) {
      renderCounter();
      const date = new Date(current.since).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
      element("leagueSince").textContent = `Seit ${date}`;
    }
    element("leagueWidget").setAttribute("aria-busy", String(busy));
    element("leagueWidget").querySelectorAll("button, input").forEach((control) => {
      control.disabled = busy || !current;
    });
    element("leagueStatus").textContent = notice;
    element("leagueStatus").hidden = !notice;
    element("leagueStatus").dataset.error = String(Boolean(notice));
    element("leagueLastPlayed").max = localDateTime(Date.now());
  }

  function apply(timer) {
    current = timer;
    render();
  }

  async function send(action, payload = {}) {
    const response = await extension.runtime.sendMessage({ type: "league-free", action, ...payload });
    if (!response?.ok) throw new Error(response?.error || "Der Timer ist gerade nicht erreichbar. Bitte die Erweiterung neu laden.");
    return response.timer;
  }

  async function run(task) {
    if (busy) return;
    busy = true;
    notice = "";
    render();
    try {
      await task();
    } catch (error) {
      notice = error.message;
    } finally {
      busy = false;
      render();
    }
  }

  element("leagueDateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const since = new Date(element("leagueLastPlayed").value).getTime();
    run(async () => apply(await send("setSince", { since })));
  });

  extension.storage.onChanged.addListener((changes, area) => {
    const timer = changes.leagueFreeTimer?.newValue;
    if (area === "local" && Number.isFinite(timer?.since)) apply(timer);
  });

  element("leagueSettings").addEventListener("toggle", () => {
    if (element("leagueSettings").open && current) {
      element("leagueLastPlayed").value = localDateTime(current.since);
      element("leagueLastPlayed").max = localDateTime(Date.now());
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) run(async () => apply(await send("get")));
  });

  run(async () => {
    apply(await send("get"));
    element("leagueLastPlayed").value = localDateTime(current.since);
  });
  window.setInterval(renderCounter, 1000);
})();
