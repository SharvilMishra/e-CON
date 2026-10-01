import { getStored, setStored } from "./storage.js";

const THEMES = new Set(["dark", "light", "system"]);
const media = window.matchMedia?.("(prefers-color-scheme: light)");
let theme = "dark";

function applyTheme() {
  const resolved = theme === "system" ? (media?.matches ? "light" : "dark") : theme;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "light" ? "#F5F7FB" : "#060B14");
}

export function getTheme() { return theme; }

export function initializeTheme() {
  const saved = getStored("theme");
  theme = THEMES.has(saved) ? saved : "dark";
  applyTheme();
}

export function setTheme(value) {
  if (!THEMES.has(value)) return;
  theme = value;
  setStored("theme", value);
  applyTheme();
}

const onSystemThemeChange = () => {
  if (theme === "system") applyTheme();
};
if (media?.addEventListener) media.addEventListener("change", onSystemThemeChange);
else media?.addListener?.(onSystemThemeChange);
