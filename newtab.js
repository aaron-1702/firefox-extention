const storage = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;

const DEFAULT_SETTINGS = {
  title: "Willkommen",
  subtitle: "Alles Wichtige auf einen Blick.",
  showClock: true,
  bg1: "#4c85a6",
  bg2: "#90afbf",
  accent: "#2f8ac7",
  align: "left",
  blur: 8,
  imageUrl: "",
  temperature: "17 C",
  categories: [
    {
      name: "Work",
      links: [
        { label: "Gmail", url: "https://mail.google.com" },
        { label: "Google Kalender", url: "https://calendar.google.com" },
        { label: "Slack", url: "https://slack.com" },
        { label: "Zoom", url: "https://zoom.us" }
      ]
    },
    {
      name: "Social",
      links: [
        { label: "Instagram", url: "https://www.instagram.com" },
        { label: "X", url: "https://x.com" },
        { label: "Reddit", url: "https://www.reddit.com" }
      ]
    },
    {
      name: "Learning",
      links: [
        { label: "Duolingo", url: "https://www.duolingo.com" },
        { label: "Khan Academy", url: "https://www.khanacademy.org" },
        { label: "Medium", url: "https://medium.com" }
      ]
    },
    {
      name: "News",
      links: [
        { label: "Tagesschau", url: "https://www.tagesschau.de" },
        { label: "Der Spiegel", url: "https://www.spiegel.de" },
        { label: "Heise", url: "https://www.heise.de" }
      ]
    }
  ]
};

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function faviconUrl(url) {
  const host = getHostname(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : "";
}

function normalizeCategories(rawCategories, legacyLinks) {
  const source = Array.isArray(rawCategories)
    ? rawCategories
    : Array.isArray(legacyLinks)
      ? [{ name: "Schnellzugriffe", links: legacyLinks }]
      : DEFAULT_SETTINGS.categories;

  const categories = source
    .filter((cat) => cat && typeof cat.name === "string")
    .map((cat) => ({
      name: cat.name.trim().slice(0, 32),
      links: Array.isArray(cat.links)
        ? cat.links
            .filter((entry) => entry && typeof entry.label === "string" && typeof entry.url === "string")
            .map((entry) => ({ label: entry.label.trim().slice(0, 40), url: entry.url.trim() }))
            .filter((entry) => entry.label && isValidHttpUrl(entry.url))
        : []
    }))
    .filter((cat) => cat.name && cat.links.length);

  return categories.length ? categories : DEFAULT_SETTINGS.categories;
}

function applyBackdrop(settings) {
  const backdrop = document.getElementById("pageBackdrop");

  document.documentElement.style.setProperty("--bg-1", settings.bg1);
  document.documentElement.style.setProperty("--bg-2", settings.bg2);
  document.documentElement.style.setProperty("--accent", settings.accent);
  document.documentElement.style.setProperty("--align", settings.align);
  document.documentElement.style.setProperty("--blur", `${settings.blur}px`);

  if (isValidHttpUrl(settings.imageUrl)) {
    backdrop.classList.add("has-image");
    backdrop.style.backgroundImage = `linear-gradient(rgba(16, 35, 58, 0.55), rgba(16, 35, 58, 0.55)), url("${settings.imageUrl.replace(/"/g, "")}")`;
  } else {
    backdrop.classList.remove("has-image");
    backdrop.style.backgroundImage = "";
  }
}

function renderCategories(categories, query = "") {
  const list = document.getElementById("categoryGrid");
  const empty = document.getElementById("emptyState");
  const normalizedQuery = query.trim().toLowerCase();
  list.innerHTML = "";

  const filtered = categories
    .map((category) => {
      if (!normalizedQuery) return category;
      const links = category.links.filter((link) => {
        return (
          link.label.toLowerCase().includes(normalizedQuery) ||
          link.url.toLowerCase().includes(normalizedQuery) ||
          category.name.toLowerCase().includes(normalizedQuery)
        );
      });

      return { ...category, links };
    })
    .filter((category) => category.links.length > 0);

  filtered.forEach((category) => {
    const card = document.createElement("section");
    card.className = "category-card card-glass";

    const title = document.createElement("h3");
    title.className = "category-title";
    title.textContent = category.name;

    const links = document.createElement("ul");
    links.className = "category-links";

    category.links.forEach((entry) => {
      const item = document.createElement("li");
      const anchor = document.createElement("a");
      anchor.href = entry.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";

      const icon = document.createElement("img");
      icon.className = "link-icon";
      icon.alt = "";
      icon.loading = "lazy";
      icon.referrerPolicy = "no-referrer";
      icon.src = faviconUrl(entry.url);

      const fallback = document.createElement("span");
      fallback.className = "link-icon-fallback";
      fallback.textContent = entry.label.slice(0, 1).toUpperCase();
      fallback.hidden = true;

      icon.addEventListener("error", () => {
        icon.hidden = true;
        fallback.hidden = false;
      });

      const text = document.createElement("span");
      text.textContent = entry.label;

      anchor.appendChild(icon);
      anchor.appendChild(fallback);
      anchor.appendChild(text);
      item.appendChild(anchor);
      links.appendChild(item);
    });

    card.appendChild(title);
    card.appendChild(links);
    list.appendChild(card);
  });

  empty.hidden = filtered.length > 0;
}

let clockTimer;

function startClock(enabled) {
  const wrap = document.getElementById("clockWrap");
  const headerClock = document.getElementById("clockHeader");
  if (!enabled) {
    wrap.hidden = true;
    headerClock.textContent = "--:--";
    if (clockTimer) clearInterval(clockTimer);
    return;
  }

  const clock = document.getElementById("clock");
  const paint = () => {
    const now = new Date();
    const detailed = now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const short = now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit"
    });
    clock.textContent = detailed;
    headerClock.textContent = short;
  };

  wrap.hidden = false;
  paint();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(paint, 1000);
}

function renderCalendar() {
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const monthNames = [
    "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
  ];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const currentDay = now.getDate();

  const title = document.getElementById("calendarTitle");
  title.textContent = `${monthNames[month]} ${year}`;

  const weekdayRow = document.getElementById("calendarWeekdays");
  weekdayRow.innerHTML = "";
  weekdays.forEach((day) => {
    const cell = document.createElement("span");
    cell.textContent = day;
    weekdayRow.appendChild(cell);
  });

  const firstDay = new Date(year, month, 1);
  const startingIndex = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  for (let i = 0; i < startingIndex; i += 1) {
    const empty = document.createElement("span");
    empty.className = "day-empty";
    empty.textContent = ".";
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const cell = document.createElement("span");
    cell.textContent = String(d);
    if (d === currentDay) cell.className = "day-current";
    grid.appendChild(cell);
  }
}

const POMODORO_SECONDS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};

let pomodoroMode = "focus";
let pomodoroLeft = POMODORO_SECONDS[pomodoroMode];
let pomodoroRunning = false;
let pomodoroTimerId;

function formatSeconds(total) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function paintPomodoro() {
  document.getElementById("pomodoroTimer").textContent = formatSeconds(pomodoroLeft);
  document.getElementById("pomodoroStart").textContent = pomodoroRunning ? "Pause" : "Start";
}

function setPomodoroMode(mode) {
  pomodoroMode = mode;
  pomodoroLeft = POMODORO_SECONDS[mode];
  pomodoroRunning = false;
  if (pomodoroTimerId) clearInterval(pomodoroTimerId);
  document.querySelectorAll(".mode-chip").forEach((el) => {
    el.classList.toggle("mode-active", el.dataset.mode === mode);
  });
  paintPomodoro();
}

function togglePomodoro() {
  pomodoroRunning = !pomodoroRunning;

  if (pomodoroTimerId) {
    clearInterval(pomodoroTimerId);
    pomodoroTimerId = null;
  }

  if (pomodoroRunning) {
    pomodoroTimerId = setInterval(() => {
      if (pomodoroLeft > 0) {
        pomodoroLeft -= 1;
      } else {
        pomodoroRunning = false;
        clearInterval(pomodoroTimerId);
        pomodoroTimerId = null;
      }
      paintPomodoro();
    }, 1000);
  }

  paintPomodoro();
}

function wirePomodoro() {
  document.querySelectorAll(".mode-chip").forEach((el) => {
    el.addEventListener("click", () => setPomodoroMode(el.dataset.mode));
  });

  document.getElementById("pomodoroStart").addEventListener("click", togglePomodoro);
  document.getElementById("pomodoroReset").addEventListener("click", () => setPomodoroMode(pomodoroMode));

  paintPomodoro();
}

async function boot() {
  const data = await storage.get("startDesignerSettings");
  const saved = data.startDesignerSettings || {};

  const settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    categories: normalizeCategories(saved.categories, saved.quickLinks),
    blur: Number.isFinite(saved.blur) ? Math.max(0, Math.min(saved.blur, 24)) : DEFAULT_SETTINGS.blur,
    align: ["left", "center", "right"].includes(saved.align) ? saved.align : DEFAULT_SETTINGS.align
  };

  document.getElementById("heroTitle").textContent = settings.title;
  document.getElementById("heroSubtitle").textContent = settings.subtitle;
  document.getElementById("tempValue").textContent = settings.temperature || DEFAULT_SETTINGS.temperature;

  applyBackdrop(settings);
  renderCategories(settings.categories);
  renderCalendar();
  wirePomodoro();
  startClock(Boolean(settings.showClock));

  document.getElementById("searchInput").addEventListener("input", (event) => {
    renderCategories(settings.categories, event.target.value);
  });

  const focusMinutes = Math.ceil(settings.categories.flatMap((cat) => cat.links).length * 2.5);
  document.getElementById("focusValue").textContent = `${focusMinutes}m`;
}

boot();
