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
        { label: "Google Kalender", url: "https://calendar.google.com" }
      ]
    },
    {
      name: "Social",
      links: [
        { label: "Instagram", url: "https://www.instagram.com" },
        { label: "Reddit", url: "https://www.reddit.com" }
      ]
    }
  ]
};

let editorCategories = [];

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeCategories(rawCategories, legacyLinks) {
  if (Array.isArray(rawCategories) && rawCategories.length > 0) {
    const categories = rawCategories
      .filter((cat) => cat && typeof cat.name === "string" && Array.isArray(cat.links))
      .map((cat) => ({
        name: cat.name.trim().slice(0, 32),
        links: cat.links
          .filter((entry) => entry && typeof entry.label === "string" && typeof entry.url === "string")
          .map((entry) => ({ label: entry.label.trim().slice(0, 40), url: entry.url.trim() }))
          .filter((entry) => entry.label && isValidHttpUrl(entry.url))
      }))
      .filter((cat) => cat.name && cat.links.length);

    if (categories.length) return categories;
  }

  if (Array.isArray(legacyLinks) && legacyLinks.length > 0) {
    const links = legacyLinks
      .filter((entry) => entry && typeof entry.label === "string" && typeof entry.url === "string")
      .map((entry) => ({ label: entry.label.trim().slice(0, 40), url: entry.url.trim() }))
      .filter((entry) => entry.label && isValidHttpUrl(entry.url));

    if (links.length) return [{ name: "Schnellzugriffe", links }];
  }

  return DEFAULT_SETTINGS.categories;
}

function status(message, isError = false) {
  const target = document.getElementById("statusText");
  target.textContent = message;
  target.style.color = isError ? "#ab2d2d" : "#14603f";
}

function cloneCategories(source) {
  return source.map((category) => ({
    name: category.name,
    links: category.links.map((link) => ({ label: link.label, url: link.url }))
  }));
}

function renderCategoryEditor() {
  const root = document.getElementById("categoryEditor");
  root.innerHTML = "";

  editorCategories.forEach((category, categoryIndex) => {
    const card = document.createElement("article");
    card.className = "category-row";

    const head = document.createElement("div");
    head.className = "category-row-head";

    const categoryInput = document.createElement("input");
    categoryInput.type = "text";
    categoryInput.value = category.name;
    categoryInput.maxLength = 32;
    categoryInput.placeholder = "Kategoriename";
    categoryInput.addEventListener("input", (event) => {
      editorCategories[categoryIndex].name = event.target.value;
    });

    const removeCategoryBtn = document.createElement("button");
    removeCategoryBtn.type = "button";
    removeCategoryBtn.className = "small-btn danger-btn";
    removeCategoryBtn.textContent = "Kategorie loeschen";
    removeCategoryBtn.addEventListener("click", () => {
      editorCategories.splice(categoryIndex, 1);
      renderCategoryEditor();
    });

    head.appendChild(categoryInput);
    head.appendChild(removeCategoryBtn);

    const linkList = document.createElement("div");
    linkList.className = "link-list";

    category.links.forEach((link, linkIndex) => {
      const row = document.createElement("div");
      row.className = "link-row";

      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = link.label;
      labelInput.maxLength = 40;
      labelInput.placeholder = "Name";
      labelInput.addEventListener("input", (event) => {
        editorCategories[categoryIndex].links[linkIndex].label = event.target.value;
      });

      const urlInput = document.createElement("input");
      urlInput.type = "url";
      urlInput.value = link.url;
      urlInput.placeholder = "https://example.com";
      urlInput.addEventListener("input", (event) => {
        editorCategories[categoryIndex].links[linkIndex].url = event.target.value;
      });

      const removeLinkBtn = document.createElement("button");
      removeLinkBtn.type = "button";
      removeLinkBtn.className = "small-btn danger-btn";
      removeLinkBtn.textContent = "Link loeschen";
      removeLinkBtn.addEventListener("click", () => {
        editorCategories[categoryIndex].links.splice(linkIndex, 1);
        renderCategoryEditor();
      });

      row.appendChild(labelInput);
      row.appendChild(urlInput);
      row.appendChild(removeLinkBtn);
      linkList.appendChild(row);
    });

    const footer = document.createElement("div");
    footer.className = "category-footer";

    const addLinkBtn = document.createElement("button");
    addLinkBtn.type = "button";
    addLinkBtn.className = "small-btn";
    addLinkBtn.textContent = "Link hinzufuegen";
    addLinkBtn.addEventListener("click", () => {
      editorCategories[categoryIndex].links.push({ label: "", url: "" });
      renderCategoryEditor();
    });

    footer.appendChild(addLinkBtn);

    card.appendChild(head);
    card.appendChild(linkList);
    card.appendChild(footer);
    root.appendChild(card);
  });
}

function collectEditorCategories() {
  return editorCategories
    .map((category) => ({
      name: (category.name || "").trim().slice(0, 32),
      links: category.links
        .map((link) => ({
          label: (link.label || "").trim().slice(0, 40),
          url: (link.url || "").trim()
        }))
        .filter((link) => link.label && isValidHttpUrl(link.url))
    }))
    .filter((category) => category.name && category.links.length);
}

async function loadSettings() {
  const data = await storage.get("startDesignerSettings");
  const raw = data.startDesignerSettings || {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    categories: normalizeCategories(raw.categories, raw.quickLinks),
    blur: Number.isFinite(raw.blur) ? Math.max(0, Math.min(raw.blur, 24)) : DEFAULT_SETTINGS.blur,
    align: ["left", "center", "right"].includes(raw.align) ? raw.align : DEFAULT_SETTINGS.align
  };

  document.getElementById("title").value = settings.title;
  document.getElementById("subtitle").value = settings.subtitle;
  document.getElementById("showClock").checked = Boolean(settings.showClock);
  document.getElementById("align").value = settings.align;
  document.getElementById("bg1").value = settings.bg1;
  document.getElementById("bg2").value = settings.bg2;
  document.getElementById("accent").value = settings.accent;
  document.getElementById("blur").value = String(settings.blur);
  document.getElementById("imageUrl").value = settings.imageUrl || "";
  document.getElementById("temperature").value = settings.temperature || DEFAULT_SETTINGS.temperature;

  editorCategories = cloneCategories(settings.categories);
  renderCategoryEditor();
}

async function saveSettings(event) {
  event.preventDefault();

  const imageUrl = document.getElementById("imageUrl").value.trim();
  if (imageUrl && !isValidHttpUrl(imageUrl)) {
    status("Bild-URL ist ungueltig. Bitte eine http(s)-Adresse verwenden.", true);
    return;
  }

  const categories = collectEditorCategories();
  if (!categories.length) {
    status("Bitte mindestens eine Kategorie mit einem gueltigen Link speichern.", true);
    return;
  }

  const payload = {
    title: document.getElementById("title").value.trim() || DEFAULT_SETTINGS.title,
    subtitle: document.getElementById("subtitle").value.trim() || DEFAULT_SETTINGS.subtitle,
    showClock: document.getElementById("showClock").checked,
    align: document.getElementById("align").value,
    bg1: document.getElementById("bg1").value,
    bg2: document.getElementById("bg2").value,
    accent: document.getElementById("accent").value,
    blur: Number(document.getElementById("blur").value),
    imageUrl,
    temperature: document.getElementById("temperature").value.trim().slice(0, 16) || DEFAULT_SETTINGS.temperature,
    categories
  };

  await storage.set({ startDesignerSettings: payload });
  status("Gespeichert. Oeffne einen neuen Tab, um das Ergebnis zu sehen.");
}

async function resetSettings() {
  await storage.set({ startDesignerSettings: DEFAULT_SETTINGS });
  await loadSettings();
  status("Auf Standardwerte zurueckgesetzt.");
}

document.getElementById("settingsForm").addEventListener("submit", saveSettings);
document.getElementById("resetButton").addEventListener("click", resetSettings);
document.getElementById("addCategoryButton").addEventListener("click", () => {
  editorCategories.push({ name: "Neue Kategorie", links: [{ label: "", url: "" }] });
  renderCategoryEditor();
});

loadSettings();
