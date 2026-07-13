const storage = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;

const HOLD_MS = 280;
const GRID_GAP = 12;
const GRID_PADDING = 12;
const TILE_TARGET_WIDTH = 230;

const DEFAULT_SETTINGS = {
  title: "Willkommen",
  subtitle: "Mach diese Seite zu deiner eigenen.",
  theme: "light",
  showClock: true,
  bg1: "#4c85a6",
  bg2: "#90afbf",
  accent: "#2f8ac7",
  align: "left",
  blur: 8,
  imageUrl: "",
  backgroundMedia: null,
  activePageId: "home",
  pages: [
    {
      id: "home",
      name: "Home",
      temperature: "17 C",
      tiles: [
        {
          id: "t1",
          name: "Work",
          col: 0,
          size: "medium",
          style: "default",
          links: [
            { id: "l1", label: "Gmail", url: "https://mail.google.com" },
            { id: "l2", label: "Google Kalender", url: "https://calendar.google.com" }
          ]
        },
        {
          id: "t2",
          name: "Personal",
          col: 1,
          size: "medium",
          style: "default",
          links: [
            { id: "l3", label: "YouTube", url: "https://www.youtube.com" },
            { id: "l4", label: "Reddit", url: "https://www.reddit.com" }
          ]
        }
      ]
    }
  ]
};

const state = {
  settings: null,
  activePageId: "home",
  layout: {
    metrics: null,
    boxes: new Map(),
    orderedIdsByColumn: []
  },
  drag: {
    tileId: null,
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
    ghostX: 0,
    ghostY: 0,
    targetCol: 0,
    targetIndex: 0,
    active: false
  },
  createAt: null,
  touchRevealTimer: null,
  miniDialogSave: null,
  suppressTileClickUntil: 0,
  suppressTileClickId: null
};

let clockTimer;
let pomodoroMode = "focus";
let pomodoroLeft = 25 * 60;
let pomodoroRunning = false;
let pomodoroTimerId;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

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

function getTileHeight(size, linkCount = 0) {
  const baseHeight = size === "small" ? 128 : size === "large" ? 188 : 152;
  const safeLinkCount = Number.isFinite(linkCount) ? Math.max(0, Math.floor(linkCount)) : 0;

  if (safeLinkCount === 0) return baseHeight;

  // Conservative estimate so link rows do not run outside the card.
  const headerAndPadding = 58;
  const rowHeight = 30;
  const rowGap = 4;
  const linksHeight = safeLinkCount * rowHeight + Math.max(0, safeLinkCount - 1) * rowGap;

  return Math.max(baseHeight, headerAndPadding + linksHeight);
}

function sizeFromLegacy(height) {
  if (height >= 180) return "large";
  if (height <= 136) return "small";
  return "medium";
}

function normalizeTiles(rawTiles, fallbackCategories = []) {
  if (Array.isArray(rawTiles) && rawTiles.length > 0) {
    return rawTiles
      .filter((tile) => tile && typeof tile.name === "string")
      .map((tile, index) => ({
        id: typeof tile.id === "string" ? tile.id : makeId("tile"),
        name: tile.name.trim().slice(0, 32) || "Kachel",
        col: Number.isFinite(tile.col) ? Math.max(0, Math.floor(tile.col)) : Math.max(0, index % 3),
        size: typeof tile.size === "string" ? tile.size : sizeFromLegacy(tile.h),
        style: typeof tile.style === "string" ? tile.style : "default",
        links: Array.isArray(tile.links)
          ? tile.links
              .filter((link) => link && typeof link.label === "string" && typeof link.url === "string")
              .map((link) => ({
                id: typeof link.id === "string" ? link.id : makeId("lnk"),
                label: link.label.trim().slice(0, 40),
                url: link.url.trim()
              }))
              .filter((link) => link.label && isValidHttpUrl(link.url))
          : []
      }));
  }

  if (Array.isArray(fallbackCategories) && fallbackCategories.length > 0) {
    return fallbackCategories.map((cat, index) => ({
      id: makeId("tile"),
      name: (cat.name || "Kachel").slice(0, 32),
      col: index % 3,
      size: "medium",
      style: "default",
      links: Array.isArray(cat.links)
        ? cat.links
            .filter((link) => link && typeof link.label === "string" && typeof link.url === "string")
            .map((link) => ({ id: makeId("lnk"), label: link.label.slice(0, 40), url: link.url.trim() }))
            .filter((link) => link.label && isValidHttpUrl(link.url))
        : []
    }));
  }

  return deepClone(DEFAULT_SETTINGS.pages[0].tiles);
}

function normalizePages(raw) {
  if (Array.isArray(raw.pages) && raw.pages.length > 0) {
    return raw.pages
      .filter((page) => page && typeof page.name === "string")
      .map((page) => ({
        id: typeof page.id === "string" ? page.id : makeId("pg"),
        name: page.name.trim().slice(0, 24) || "Page",
        temperature: (page.temperature || raw.temperature || "17 C").toString().slice(0, 16),
        tiles: normalizeTiles(page.tiles, page.categories)
      }));
  }

  return [
    {
      id: "home",
      name: "Home",
      temperature: (raw.temperature || "17 C").toString().slice(0, 16),
      tiles: normalizeTiles([], raw.categories)
    }
  ];
}

function getActivePage() {
  return state.settings.pages.find((page) => page.id === state.activePageId) || state.settings.pages[0];
}

async function saveSettings() {
  await storage.set({ startDesignerSettings: state.settings });
}

function setCssVars() {
  document.documentElement.style.setProperty("--bg-1", state.settings.bg1);
  document.documentElement.style.setProperty("--bg-2", state.settings.bg2);
  document.documentElement.style.setProperty("--accent", state.settings.accent);
  document.documentElement.style.setProperty("--align", state.settings.align);
  document.documentElement.style.setProperty("--blur", `${state.settings.blur}px`);
}

function applyTheme() {
  const theme = state.settings.theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.textContent = theme === "dark" ? "Lightmode" : "Darkmode";
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
}

function applyBackdrop() {
  const backdrop = document.getElementById("pageBackdrop");
  const video = document.getElementById("bgVideo");
  const media = state.settings.backgroundMedia;

  if (media && typeof media.dataUrl === "string") {
    if (media.mime === "video/mp4") {
      video.hidden = false;
      video.src = media.dataUrl;
      backdrop.classList.remove("has-image");
      backdrop.style.backgroundImage = "";
      return;
    }

    video.hidden = true;
    video.removeAttribute("src");
    backdrop.classList.add("has-image");
    backdrop.style.backgroundImage = `linear-gradient(rgba(16, 35, 58, 0.32), rgba(16, 35, 58, 0.32)), url("${media.dataUrl.replace(/"/g, "")}")`;
    return;
  }

  video.hidden = true;
  video.removeAttribute("src");

  if (isValidHttpUrl(state.settings.imageUrl)) {
    backdrop.classList.add("has-image");
    backdrop.style.backgroundImage = `linear-gradient(rgba(16, 35, 58, 0.32), rgba(16, 35, 58, 0.32)), url("${state.settings.imageUrl.replace(/"/g, "")}")`;
  } else {
    backdrop.classList.remove("has-image");
    backdrop.style.backgroundImage = "";
  }
}

function closeContextMenu() {
  const menu = document.getElementById("contextMenu");
  menu.hidden = true;
  menu.innerHTML = "";
}

function openContextMenu(x, y, items) {
  const menu = document.getElementById("contextMenu");
  menu.innerHTML = "";

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      closeContextMenu();
      await item.action();
    });
    menu.appendChild(btn);
  });

  menu.hidden = false;
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;
}

function closeMiniDialog() {
  const dialog = document.getElementById("miniDialog");
  dialog.hidden = true;
  state.miniDialogSave = null;
}

function openMiniDialog({ title, x, y, fields, onSave }) {
  const dialog = document.getElementById("miniDialog");
  const titleNode = document.getElementById("miniDialogTitle");
  const fieldsWrap = document.getElementById("miniDialogFields");

  titleNode.textContent = title;
  fieldsWrap.innerHTML = "";

  fields.forEach((field) => {
    const label = document.createElement("label");
    label.textContent = field.label;

    const input = document.createElement(field.type === "select" ? "select" : "input");
    input.dataset.key = field.key;
    if (field.type && field.type !== "select") input.type = field.type;
    if (field.maxLength) input.maxLength = field.maxLength;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (typeof field.value === "string") input.value = field.value;

    if (field.type === "select" && Array.isArray(field.options)) {
      field.options.forEach((option) => {
        const item = document.createElement("option");
        item.value = option.value;
        item.textContent = option.label;
        if (option.value === field.value) item.selected = true;
        input.appendChild(item);
      });
    }

    label.appendChild(input);
    fieldsWrap.appendChild(label);
  });

  dialog.style.left = `${Math.max(8, x)}px`;
  dialog.style.top = `${Math.max(8, y)}px`;
  dialog.hidden = false;

  const firstInput = fieldsWrap.querySelector("input,select");
  if (firstInput) firstInput.focus();

  state.miniDialogSave = async () => {
    const values = {};
    fieldsWrap.querySelectorAll("input,select").forEach((node) => {
      values[node.dataset.key] = node.value;
    });
    await onSave(values);
    closeMiniDialog();
  };
}

function getColumnCount(width) {
  if (width < 700) return 1;
  if (width < 980) return 2;
  if (width < 1300) return 3;
  return 4;
}

function measureBoard() {
  const board = document.getElementById("tileBoard");
  const rect = board.getBoundingClientRect();
  const fitCount = Math.floor((rect.width - GRID_PADDING * 2 + GRID_GAP) / (TILE_TARGET_WIDTH + GRID_GAP));
  const colCount = Math.max(1, fitCount || getColumnCount(rect.width));
  const available = rect.width - GRID_PADDING * 2 - GRID_GAP * (colCount - 1);
  const colWidth = Math.max(170, Math.min(TILE_TARGET_WIDTH, available / colCount));

  const metrics = {
    rect,
    colCount,
    colWidth,
    gap: GRID_GAP,
    padding: GRID_PADDING,
    xForCol(col) {
      return GRID_PADDING + col * (colWidth + GRID_GAP);
    }
  };

  state.layout.metrics = metrics;
  return metrics;
}

function buildColumnBuckets(page, metrics, excludeTileId = null) {
  const columns = Array.from({ length: metrics.colCount }, () => []);

  page.tiles.forEach((tile) => {
    if (tile.id === excludeTileId) return;
    const normalizedCol = Math.max(0, Math.min(metrics.colCount - 1, Number.isFinite(tile.col) ? tile.col : 0));
    tile.col = normalizedCol;
    columns[normalizedCol].push(tile.id);
  });

  return columns;
}

function insertTileInColumnStructure(columns, tileId, col, index) {
  columns.forEach((list) => {
    const pos = list.indexOf(tileId);
    if (pos >= 0) list.splice(pos, 1);
  });
  const target = columns[col];
  const safeIndex = Math.max(0, Math.min(target.length, index));
  target.splice(safeIndex, 0, tileId);
}

function applyColumnStructureToPage(page, columns) {
  const byId = new Map(page.tiles.map((tile) => [tile.id, tile]));
  const ordered = [];

  columns.forEach((list, col) => {
    list.forEach((tileId) => {
      const tile = byId.get(tileId);
      if (!tile) return;
      tile.col = col;
      ordered.push(tile);
    });
  });

  page.tiles = ordered;
}

function calculateLayout(page, metrics, preview = null) {
  const boxes = new Map();
  const columns = buildColumnBuckets(page, metrics, preview?.tileId || null);

  if (preview) {
    insertTileInColumnStructure(columns, preview.tileId, preview.col, preview.index);
  }

  const yOffsets = Array.from({ length: metrics.colCount }, () => metrics.padding);

  columns.forEach((tileIds, col) => {
    tileIds.forEach((tileId) => {
      const tile = page.tiles.find((entry) => entry.id === tileId) || (preview && preview.tile);
      if (!tile) return;
      const height = getTileHeight(tile.size, tile.links?.length || 0);
      const box = {
        left: metrics.xForCol(col),
        top: yOffsets[col],
        width: metrics.colWidth,
        height,
        col
      };
      boxes.set(tileId, box);
      yOffsets[col] += height + metrics.gap;
    });
  });

  const maxBottom = Math.max(metrics.rect.height - metrics.padding, ...Array.from(boxes.values()).map((b) => b.top + b.height));
  return { boxes, columns, maxBottom };
}

function computeDropTarget(metrics, columns, boxes, pointerX, pointerY) {
  const localX = pointerX - metrics.rect.left;
  const localY = pointerY - metrics.rect.top;
  const colRaw = Math.floor((localX - metrics.padding + metrics.gap / 2) / (metrics.colWidth + metrics.gap));
  const col = Math.max(0, Math.min(metrics.colCount - 1, colRaw));
  const ids = columns[col];

  let index = ids.length;
  for (let i = 0; i < ids.length; i += 1) {
    const box = boxes.get(ids[i]);
    if (!box) continue;
    if (localY < box.top + box.height / 2) {
      index = i;
      break;
    }
  }

  return { col, index };
}

function renderColumnGuides(board, metrics, maxBottom) {
  const guideWrap = document.createElement("div");
  guideWrap.className = "column-guides";
  const guideBottom = Math.max(metrics.rect.height - metrics.padding, maxBottom + 80);

  for (let col = 0; col < metrics.colCount; col += 1) {
    const guide = document.createElement("div");
    guide.className = "column-guide";
    guide.style.left = `${metrics.xForCol(col)}px`;
    guide.style.width = `${metrics.colWidth}px`;
    guide.style.height = `${guideBottom - metrics.padding}px`;
    guideWrap.appendChild(guide);
  }

  board.appendChild(guideWrap);
}

function renderChipNav() {
  const nav = document.getElementById("chipNav");
  nav.innerHTML = "";

  state.settings.pages.forEach((page) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = page.name;
    if (page.id === state.activePageId) btn.classList.add("chip-active");

    btn.addEventListener("click", async () => {
      state.activePageId = page.id;
      state.settings.activePageId = page.id;
      await saveSettings();
      renderAll();
    });

    btn.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(event.clientX, event.clientY, [
        {
          label: "Page umbenennen",
          action: async () => {
            const next = window.prompt("Neuer Page-Name", page.name);
            if (!next) return;
            page.name = next.trim().slice(0, 24) || page.name;
            await saveSettings();
            renderAll();
          }
        },
        {
          label: "Page loeschen",
          action: async () => {
            if (state.settings.pages.length <= 1) return;
            const ok = window.confirm(`Page ${page.name} wirklich loeschen?`);
            if (!ok) return;
            state.settings.pages = state.settings.pages.filter((p) => p.id !== page.id);
            state.activePageId = state.settings.pages[0].id;
            state.settings.activePageId = state.activePageId;
            await saveSettings();
            renderAll();
          }
        }
      ]);
    });

    nav.appendChild(btn);
  });
}

function tileOpacity(style) {
  if (style === "soft") return 0.9;
  if (style === "solid") return 1;
  return 0.96;
}

function attachLongPressDrag(card, tile, page, metrics) {
  let holdTimer;
  let holdActive = false;

  const canStart = (target) => {
    if (!target) return false;
    if (target.closest(".tile-action") || target.closest(".link-menu-btn")) return false;
    const tag = target.tagName.toLowerCase();
    return tag !== "a" && tag !== "button" && tag !== "input";
  };

  const finishDrag = async () => {
    if (!state.drag.active || state.drag.tileId !== tile.id) {
      holdActive = false;
      return;
    }

    const { targetCol, targetIndex } = state.drag;
    const columns = buildColumnBuckets(page, metrics, tile.id);
    insertTileInColumnStructure(columns, tile.id, targetCol, targetIndex);
    applyColumnStructureToPage(page, columns);

    state.drag.active = false;
    state.drag.tileId = null;
    state.suppressTileClickUntil = Date.now() + 420;
    state.suppressTileClickId = tile.id;
    card.classList.remove("dragging");
    document.getElementById("tileBoard").classList.remove("show-grid");

    await saveSettings();
    renderAll();
    holdActive = false;
  };

  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !canStart(event.target)) return;
    holdActive = true;

    const box = card.getBoundingClientRect();
    state.drag.offsetX = event.clientX - box.left;
    state.drag.offsetY = event.clientY - box.top;
    state.drag.pointerId = event.pointerId;

    holdTimer = setTimeout(() => {
      if (!holdActive) return;
      state.drag.active = true;
      state.drag.tileId = tile.id;
      state.drag.targetCol = tile.col;
      state.drag.targetIndex = 0;
      card.classList.add("dragging");
      card.setPointerCapture(event.pointerId);
      document.getElementById("tileBoard").classList.add("show-grid");
    }, HOLD_MS);
  });

  card.addEventListener("pointermove", (event) => {
    if (!holdActive || !state.drag.active || state.drag.tileId !== tile.id) return;
    event.preventDefault();

    const board = document.getElementById("tileBoard");
    const columns = buildColumnBuckets(page, metrics, tile.id);
    const previewBoxes = calculateLayout(page, metrics).boxes;
    const target = computeDropTarget(metrics, columns, previewBoxes, event.clientX, event.clientY);

    state.drag.targetCol = target.col;
    state.drag.targetIndex = target.index;

    state.drag.ghostX = event.clientX - metrics.rect.left - state.drag.offsetX;
    state.drag.ghostY = event.clientY - metrics.rect.top - state.drag.offsetY;

    card.style.left = `${Math.max(0, Math.min(board.clientWidth - card.offsetWidth, state.drag.ghostX))}px`;
    card.style.top = `${Math.max(0, Math.min(board.clientHeight - card.offsetHeight, state.drag.ghostY))}px`;
  });

  const cancelHold = () => {
    holdActive = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  card.addEventListener("pointerup", async (event) => {
    if (!state.drag.active && holdActive && event?.pointerType === "touch") {
      card.classList.add("show-controls");
      if (state.touchRevealTimer) clearTimeout(state.touchRevealTimer);
      state.touchRevealTimer = setTimeout(() => {
        card.classList.remove("show-controls");
      }, 2200);
      card.dataset.touchRevealUntil = String(Date.now() + 500);
    }
    cancelHold();
    await finishDrag();
  });

  card.addEventListener("pointercancel", async () => {
    cancelHold();
    await finishDrag();
  });
}

function createTileCard(tile, page, box, metrics) {
  const card = document.createElement("article");
  card.className = "tile-card";
  card.dataset.tileId = tile.id;
  card.style.left = `${box.left}px`;
  card.style.top = `${box.top}px`;
  card.style.width = `${box.width}px`;
  card.style.height = `${box.height}px`;
  card.style.opacity = String(tileOpacity(tile.style));

  const header = document.createElement("header");
  header.className = "tile-header";

  const title = document.createElement("h3");
  title.className = "tile-title";
  title.textContent = tile.name;

  const actions = document.createElement("div");
  actions.className = "tile-actions";

  const addLink = document.createElement("button");
  addLink.className = "tile-action";
  addLink.type = "button";
  addLink.textContent = "+";
  addLink.title = "Neuen Link hinzufügen";
  addLink.addEventListener("pointerdown", (event) => event.stopPropagation());
  addLink.addEventListener("click", async (event) => {
    event.stopPropagation();
    openMiniDialog({
      title: "Link hinzufügen",
      x: event.clientX,
      y: event.clientY,
      fields: [
        { key: "label", label: "Name", type: "text", value: "Neuer Link", maxLength: 40 },
        { key: "url", label: "URL", type: "url", value: "https://", placeholder: "https://example.com" }
      ],
      onSave: async (values) => {
        if (!values.label || !isValidHttpUrl(values.url || "")) return;
        tile.links.push({ id: makeId("lnk"), label: values.label.trim().slice(0, 40), url: values.url.trim() });
        await saveSettings();
        renderAll();
      }
    });
  });

  const tileMenu = document.createElement("button");
  tileMenu.className = "tile-action";
  tileMenu.type = "button";
  tileMenu.textContent = "⋯";
  tileMenu.title = "Kachel-Einstellungen";
  tileMenu.addEventListener("pointerdown", (event) => event.stopPropagation());
  tileMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    openContextMenu(event.clientX, event.clientY, [
      {
        label: "Titel ändern",
        action: async () => {
          openMiniDialog({
            title: "Kachel bearbeiten",
            x: event.clientX,
            y: event.clientY,
            fields: [
              { key: "name", label: "Titel", type: "text", value: tile.name, maxLength: 32 }
            ],
            onSave: async (values) => {
              if (!values.name) return;
              tile.name = values.name.trim().slice(0, 32) || tile.name;
              await saveSettings();
              renderAll();
            }
          });
        }
      },
      {
        label: "Größe: Klein",
        action: async () => {
          tile.size = "small";
          await saveSettings();
          renderAll();
        }
      },
      {
        label: "Größe: Mittel",
        action: async () => {
          tile.size = "medium";
          await saveSettings();
          renderAll();
        }
      },
      {
        label: "Größe: Groß",
        action: async () => {
          tile.size = "large";
          await saveSettings();
          renderAll();
        }
      },
      {
        label: "Darstellung: Soft",
        action: async () => {
          tile.style = "soft";
          await saveSettings();
          renderAll();
        }
      },
      {
        label: "Darstellung: Standard",
        action: async () => {
          tile.style = "default";
          await saveSettings();
          renderAll();
        }
      },
      {
        label: "Kachel löschen",
        action: async () => {
          const ok = window.confirm(`Kachel ${tile.name} wirklich löschen?`);
          if (!ok) return;
          page.tiles = page.tiles.filter((item) => item.id !== tile.id);
          await saveSettings();
          renderAll();
        }
      }
    ]);
  });

  actions.appendChild(addLink);
  actions.appendChild(tileMenu);
  header.appendChild(title);
  header.appendChild(actions);
  card.appendChild(header);

  const links = document.createElement("ul");
  links.className = "tile-links";

  tile.links.forEach((link) => {
    const row = document.createElement("li");
    row.className = "tile-link";

    const anchor = document.createElement("a");
    anchor.className = "tile-link-main";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";

    const icon = document.createElement("img");
    icon.className = "link-icon";
    icon.alt = "";
    icon.loading = "lazy";
    icon.referrerPolicy = "no-referrer";
    icon.src = faviconUrl(link.url);

    icon.addEventListener("error", () => {
      icon.hidden = true;
    });

    const label = document.createElement("span");
    label.className = "link-label";
    label.textContent = link.label;

    anchor.appendChild(icon);
    anchor.appendChild(label);

    const menuButton = document.createElement("button");
    menuButton.className = "link-menu-btn";
    menuButton.type = "button";
    menuButton.textContent = "⋮";
    menuButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openContextMenu(event.clientX, event.clientY, [
        {
          label: "Link bearbeiten",
          action: async () => {
            openMiniDialog({
              title: "Link bearbeiten",
              x: event.clientX,
              y: event.clientY,
              fields: [
                { key: "label", label: "Name", type: "text", value: link.label, maxLength: 40 },
                { key: "url", label: "URL", type: "url", value: link.url }
              ],
              onSave: async (values) => {
                if (!values.label || !isValidHttpUrl(values.url || "")) return;
                link.label = values.label.trim().slice(0, 40);
                link.url = values.url.trim();
                await saveSettings();
                renderAll();
              }
            });
          }
        },
        {
          label: "Link umbenennen",
          action: async () => {
            openMiniDialog({
              title: "Link umbenennen",
              x: event.clientX,
              y: event.clientY,
              fields: [
                { key: "label", label: "Name", type: "text", value: link.label, maxLength: 40 }
              ],
              onSave: async (values) => {
                if (!values.label) return;
                link.label = values.label.trim().slice(0, 40);
                await saveSettings();
                renderAll();
              }
            });
          }
        },
        {
          label: "URL ändern",
          action: async () => {
            openMiniDialog({
              title: "URL ändern",
              x: event.clientX,
              y: event.clientY,
              fields: [
                { key: "url", label: "URL", type: "url", value: link.url }
              ],
              onSave: async (values) => {
                if (!isValidHttpUrl(values.url || "")) return;
                link.url = values.url.trim();
                await saveSettings();
                renderAll();
              }
            });
          }
        },
        {
          label: "Link löschen",
          action: async () => {
            tile.links = tile.links.filter((item) => item.id !== link.id);
            await saveSettings();
            renderAll();
          }
        }
      ]);
    });

    row.appendChild(anchor);
    row.appendChild(menuButton);
    links.appendChild(row);
  });

  card.appendChild(links);
  card.addEventListener("click", (event) => {
    if (event.target.closest("a") || event.target.closest("button") || event.target.closest("#contextMenu")) return;
    if (state.drag.active) return;
    if (state.suppressTileClickId === tile.id && Date.now() <= state.suppressTileClickUntil) {
      state.suppressTileClickId = null;
      state.suppressTileClickUntil = 0;
      return;
    }
    const touchUntil = Number(card.dataset.touchRevealUntil || "0");
    if (touchUntil && Date.now() <= touchUntil) return;
    // Intentionally no default action on tile background click.
  });

  attachLongPressDrag(card, tile, page, metrics);
  return card;
}

function renderTiles() {
  const board = document.getElementById("tileBoard");
  const empty = document.getElementById("emptyState");
  const page = getActivePage();
  const metrics = measureBoard();

  board.innerHTML = "";
  board.classList.toggle("show-grid", Boolean(state.drag.active));

  const layout = calculateLayout(page, metrics);
  state.layout.boxes = layout.boxes;
  state.layout.orderedIdsByColumn = layout.columns;

  renderColumnGuides(board, metrics, layout.maxBottom);

  page.tiles.forEach((tile) => {
    const box = layout.boxes.get(tile.id);
    if (!box) return;
    board.appendChild(createTileCard(tile, page, box, metrics));
  });

  board.style.minHeight = `${Math.max(board.clientHeight, layout.maxBottom + 24)}px`;
  empty.hidden = page.tiles.length > 0;
}

function openQuickCreate(clientX, clientY, col, index) {
  const panel = document.getElementById("quickCreate");
  document.getElementById("quickTileName").value = "";
  document.getElementById("quickLinkLabel").value = "";
  document.getElementById("quickLinkUrl").value = "";
  panel.style.left = `${Math.max(8, clientX)}px`;
  panel.style.top = `${Math.max(8, clientY)}px`;
  panel.hidden = false;
  state.createAt = { col, index };
}

function closeQuickCreate() {
  const panel = document.getElementById("quickCreate");
  panel.hidden = true;
  state.createAt = null;
}

function renderFocusAndStats() {
  const page = getActivePage();
  document.getElementById("tempValue").textContent = page.temperature || "--";
  const focusMinutes = Math.ceil(page.tiles.flatMap((tile) => tile.links).length * 2.5);
  document.getElementById("focusValue").textContent = `${focusMinutes}m`;
}

function renderAll() {
  applyTheme();
  document.getElementById("heroTitle").textContent = state.settings.title;
  document.getElementById("heroSubtitle").textContent = state.settings.subtitle;
  renderChipNav();
  renderTiles();
  renderFocusAndStats();
  applyBackdrop();
}

function looksLikeUrl(rawInput) {
  const value = rawInput.trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return value.includes(".") && !value.includes(" ");
}

function normalizeAddress(rawInput) {
  const value = rawInput.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

async function runBrowserSearch(rawInput) {
  const query = rawInput.trim();
  if (!query) return;

  if (looksLikeUrl(query)) {
    window.location.href = normalizeAddress(query);
    return;
  }

  try {
    if (typeof browser !== "undefined" && browser.search?.search) {
      await browser.search.search({ query, disposition: "CURRENT_TAB" });
      return;
    }
  } catch {
    // fallback
  }

  window.location.href = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function startClock(enabled) {
  const clockStat = document.getElementById("clockStat");
  const headerClock = document.getElementById("clockHeader");
  if (!enabled) {
    clockStat.hidden = true;
    headerClock.textContent = "--:--";
    if (clockTimer) clearInterval(clockTimer);
    return;
  }

  const paint = () => {
    const now = new Date();
    headerClock.textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };

  clockStat.hidden = false;
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

  document.getElementById("calendarTitle").textContent = `${monthNames[month]} ${year}`;

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

function paintPomodoro() {
  const minutes = String(Math.floor(pomodoroLeft / 60)).padStart(2, "0");
  const seconds = String(pomodoroLeft % 60).padStart(2, "0");
  document.getElementById("pomodoroTimer").textContent = `${minutes}:${seconds}`;
  document.getElementById("pomodoroStart").textContent = pomodoroRunning ? "Pause" : "Start";
}

function setPomodoroMode(mode) {
  const duration = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  pomodoroMode = mode;
  pomodoroLeft = duration[mode];
  pomodoroRunning = false;
  if (pomodoroTimerId) clearInterval(pomodoroTimerId);
  document.querySelectorAll(".mode-chip").forEach((el) => {
    el.classList.toggle("mode-active", el.dataset.mode === mode);
  });
  paintPomodoro();
}

function togglePomodoro() {
  pomodoroRunning = !pomodoroRunning;
  if (pomodoroTimerId) clearInterval(pomodoroTimerId);

  if (pomodoroRunning) {
    pomodoroTimerId = setInterval(() => {
      if (pomodoroLeft > 0) {
        pomodoroLeft -= 1;
      } else {
        pomodoroRunning = false;
        clearInterval(pomodoroTimerId);
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

async function handleBackgroundUpload(file) {
  const allowed = ["image/png", "image/jpeg", "video/mp4"];
  if (!allowed.includes(file.type)) return;

  const reader = new FileReader();
  reader.onload = async () => {
    state.settings.backgroundMedia = {
      mime: file.type,
      dataUrl: String(reader.result)
    };
    state.settings.imageUrl = "";
    await saveSettings();
    applyBackdrop();
  };
  reader.readAsDataURL(file);
}

function wireBoardClickCreate() {
  const board = document.getElementById("tileBoard");
  board.addEventListener("click", (event) => {
    if (event.target.closest(".tile-card") || event.target.closest("#contextMenu")) return;

    const metrics = measureBoard();
    const page = getActivePage();
    const layout = calculateLayout(page, metrics);
    const target = computeDropTarget(metrics, layout.columns, layout.boxes, event.clientX, event.clientY);
    openQuickCreate(event.clientX + 6, event.clientY + 6, target.col, target.index);
  });
}

function wireGeneralEvents() {
  document.addEventListener("pointerdown", (event) => {
    const menu = document.getElementById("contextMenu");
    const miniDialog = document.getElementById("miniDialog");
    const quickCreate = document.getElementById("quickCreate");
    if (!menu.hidden && !event.target.closest("#contextMenu") && !event.target.closest(".tile-action") && !event.target.closest(".link-menu-btn")) {
      closeContextMenu();
    }
    if (!miniDialog.hidden && !event.target.closest("#miniDialog") && !event.target.closest(".tile-action") && !event.target.closest(".link-menu-btn") && !event.target.closest("#addPageButton")) {
      closeMiniDialog();
    }
    if (!quickCreate.hidden && !event.target.closest("#quickCreate") && !event.target.closest("#tileBoard")) {
      closeQuickCreate();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeContextMenu();
      closeMiniDialog();
      closeQuickCreate();
    }
  });

  document.getElementById("miniDialogCancel").addEventListener("click", closeMiniDialog);
  document.getElementById("miniDialogSave").addEventListener("click", async () => {
    if (typeof state.miniDialogSave === "function") {
      await state.miniDialogSave();
    }
  });

  document.getElementById("quickCreateCancel").addEventListener("click", closeQuickCreate);
  document.getElementById("quickCreateSave").addEventListener("click", async () => {
    const page = getActivePage();
    const name = document.getElementById("quickTileName").value.trim() || "Neue Kachel";
    const label = document.getElementById("quickLinkLabel").value.trim();
    const url = document.getElementById("quickLinkUrl").value.trim();

    const tile = {
      id: makeId("tile"),
      name: name.slice(0, 32),
      col: state.createAt ? state.createAt.col : 0,
      size: "medium",
      style: "default",
      links: []
    };

    if (label && isValidHttpUrl(url)) {
      tile.links.push({ id: makeId("lnk"), label: label.slice(0, 40), url });
    }

    const metrics = measureBoard();
    const columns = buildColumnBuckets(page, metrics);
    const col = state.createAt ? state.createAt.col : 0;
    const index = state.createAt ? state.createAt.index : columns[col].length;
    page.tiles.push(tile);
    insertTileInColumnStructure(columns, tile.id, col, index);
    applyColumnStructureToPage(page, columns);

    await saveSettings();
    closeQuickCreate();
    renderAll();
  });

  document.getElementById("searchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await runBrowserSearch(document.getElementById("searchInput").value);
  });

  document.getElementById("addPageButton").addEventListener("click", async () => {
    const buttonRect = document.getElementById("addPageButton").getBoundingClientRect();
    openMiniDialog({
      title: "Neue Page",
      x: buttonRect.left,
      y: buttonRect.bottom + 6,
      fields: [
        { key: "name", label: "Name", type: "text", value: `Page ${state.settings.pages.length + 1}`, maxLength: 24 }
      ],
      onSave: async (values) => {
        if (!values.name) return;
        const page = {
          id: makeId("pg"),
          name: values.name.trim().slice(0, 24),
          temperature: "17 C",
          tiles: []
        };
        state.settings.pages.push(page);
        state.activePageId = page.id;
        state.settings.activePageId = page.id;
        await saveSettings();
        renderAll();
      }
    });
  });

  document.getElementById("themeToggle").addEventListener("click", async () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    await saveSettings();
    renderAll();
  });

  const uploadInput = document.getElementById("backgroundUploadInput");
  document.getElementById("uploadBackgroundButton").addEventListener("click", () => uploadInput.click());
  uploadInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    await handleBackgroundUpload(file);
    uploadInput.value = "";
  });

  document.getElementById("clearBackgroundButton").addEventListener("click", async () => {
    state.settings.backgroundMedia = null;
    await saveSettings();
    applyBackdrop();
  });

  window.addEventListener("resize", () => {
    renderAll();
  });

  wireBoardClickCreate();
}

async function boot() {
  const data = await storage.get("startDesignerSettings");
  const raw = data.startDesignerSettings || {};

  const settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    pages: normalizePages(raw),
    blur: Number.isFinite(raw.blur) ? Math.max(0, Math.min(raw.blur, 24)) : DEFAULT_SETTINGS.blur,
    align: ["left", "center", "right"].includes(raw.align) ? raw.align : DEFAULT_SETTINGS.align,
    backgroundMedia: raw.backgroundMedia && typeof raw.backgroundMedia.dataUrl === "string" ? raw.backgroundMedia : null,
    theme: raw.theme === "dark" ? "dark" : "light"
  };

  state.settings = settings;
  state.activePageId = settings.pages.some((page) => page.id === settings.activePageId)
    ? settings.activePageId
    : settings.pages[0].id;

  setCssVars();
  startClock(Boolean(settings.showClock));
  renderCalendar();
  wirePomodoro();
  wireGeneralEvents();
  renderAll();
}

boot();
