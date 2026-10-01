// ==========================================================================
// e-CON — Settings
//
// A category menu (Account / Privacy / Get App / About), Instagram-style,
// rather than one long flat page. Each category is its own sub-view reached
// via #/settings/<category> — the router's existing one-level param is
// enough for this, so no new routing mechanism was needed. About's own
// children (Help, Support, Contact, Privacy & Policies) go one level deeper
// than that param supports, so they're registered as standalone routes
// instead (see app.js) — reached only from here, not from the main drawer.
// ==========================================================================
import { h, escapeHTML, qs } from "../../js/utils.js";
import { skeleton } from "../../components/loader.js";
import { avatarHTML } from "../../components/avatar.js";
import { confirmDialog } from "../../components/modal.js";
import { showToast } from "../../components/toast.js";
import { reportError } from "../../js/ui.js";
import { navigate, back } from "../../js/router.js";
import { auth } from "../../firebase/config.js";
import { logout } from "../../firebase/auth.js";
import { getUserById, setPrivateAccount, isPrivateAccount } from "../../services/users.js";
import {
  isInstallAvailable, onInstallAvailabilityChange, promptInstall, isRunningStandalone
} from "../../js/installPrompt.js";

const ICONS = {
  account: `<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6"/>`,
  privacy: `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  getapp: `<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>`,
  about: `<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 11.5h1v5h1"/>`
};
function iconSVG(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function backHeaderHTML(title) {
  return `
    <div class="page-head">
      <button class="btn btn--icon" id="settings-sub-back" aria-label="Back to Settings">‹</button>
      <h1 style="font-size:1.35rem;">${escapeHTML(title)}</h1>
    </div>`;
}
function wireBackButton() {
  qs("#settings-sub-back").addEventListener("click", () => back());
}

/* ==========================================================================
   Main menu
   ========================================================================== */

function menuHTML() {
  const rows = [
    { key: "account", icon: "account", label: "Account", sub: "Personal details, sign out" },
    { key: "privacy", icon: "privacy", label: "Privacy", sub: "Private or public account" },
    { key: "getapp", route: "get-app", icon: "getapp", label: "Get App", sub: "Add to your home screen" },
    { key: "about", icon: "about", label: "About", sub: "Help, support, contact, policies" }
  ];
  return `
    <div class="page settings-page">
      <div class="page-head"><h1>Settings</h1></div>
      <div class="settings-menu">
        ${rows.map((r) => `
          <button class="settings-menu-item" data-section="${r.route || r.key}">
            <span class="settings-menu-icon">${iconSVG(r.icon)}</span>
            <span class="settings-menu-text">
              <span class="settings-menu-label">${escapeHTML(r.label)}</span>
              <span class="settings-menu-sub">${escapeHTML(r.sub)}</span>
            </span>
            <span class="user-row-chevron" aria-hidden="true">›</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function renderMenu(container) {
  container.appendChild(h(menuHTML()));
  qs(".settings-menu").addEventListener("click", (e) => {
    const btn = e.target.closest(".settings-menu-item");
    if (btn) navigate("settings", btn.dataset.section);
  });
  return function teardown() {};
}

/* ==========================================================================
   Account
   ========================================================================== */

function providerLabel(user) {
  const ids = (user?.providerData || []).map((p) => p.providerId);
  const names = [];
  if (ids.includes("google.com")) names.push("Google");
  if (ids.includes("password")) names.push("Email & password");
  return names.join(" · ") || "—";
}

async function renderAccount(container) {
  const user = auth.currentUser;

  container.appendChild(h(`
    <div class="page settings-page">
      ${backHeaderHTML("Account")}
      <div id="settings-account">${skeleton("height:92px;")}</div>

      <div class="card settings-row">
        <span class="text-muted">Sign-in method</span>
        <span>${escapeHTML(providerLabel(user))}</span>
      </div>
      <div class="card settings-row">
        <span class="text-muted">Email</span>
        <span class="settings-value">${escapeHTML(user?.email || "—")}</span>
      </div>
      <div class="card settings-row">
        <span class="text-muted">Email verified</span>
        <span>${user?.emailVerified ? "Yes" : "No"}</span>
      </div>

      <button class="btn btn--danger settings-signout" id="logout-btn">Sign out</button>
    </div>
  `));
  wireBackButton();

  const accountEl = qs("#settings-account");
  try {
    const profile = await getUserById(user.uid);
    accountEl.innerHTML = `
      <button class="card settings-account-card" id="settings-profile">
        ${avatarHTML(profile || {}, 54)}
        <span class="settings-account-text">
          <span class="settings-account-name">${escapeHTML(profile?.name || "You")}</span>
          <span class="settings-account-handle">@${escapeHTML(profile?.username || "")}</span>
        </span>
        <span class="user-row-chevron" aria-hidden="true">›</span>
      </button>`;
    qs("#settings-profile").addEventListener("click", () => navigate("me"));
  } catch (err) {
    reportError(err, "loading your account");
    accountEl.innerHTML = "";
  }

  qs("#logout-btn").addEventListener("click", () => {
    confirmDialog("You'll need to sign in again to get back in.", {
      confirmLabel: "Sign out",
      onConfirm: async () => {
        try {
          await logout();
        } catch (err) {
          reportError(err, "signing out");
        }
      }
    });
  });

  return function teardown() {};
}

/* ==========================================================================
   Privacy
   ========================================================================== */

async function renderPrivacy(container) {
  container.appendChild(h(`
    <div class="page settings-page">
      ${backHeaderHTML("Privacy")}
      <div class="card settings-row settings-row--toggle">
        <span class="settings-toggle-text">
          <span>Private account</span>
          <span class="field-hint">New messages need your approval before the chat opens.</span>
        </span>
        <button type="button" class="toggle" id="privacy-toggle"
                role="switch" aria-checked="false" aria-label="Private account">
          <span class="toggle-thumb"></span>
        </button>
      </div>
    </div>
  `));
  wireBackButton();

  const toggle = qs("#privacy-toggle");
  let busy = false;

  function paint(isPrivate) {
    toggle.classList.toggle("toggle--on", isPrivate);
    toggle.setAttribute("aria-checked", String(isPrivate));
  }

  try {
    const profile = await getUserById(auth.currentUser.uid);
    paint(isPrivateAccount(profile));
  } catch (err) {
    reportError(err, "loading privacy setting");
  }

  toggle.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const next = !toggle.classList.contains("toggle--on");
    paint(next);
    try {
      await setPrivateAccount(next);
      showToast(next ? "Your account is now private." : "Your account is now public.", "success");
    } catch (err) {
      paint(!next);
      reportError(err, "updating privacy setting");
    } finally {
      busy = false;
    }
  });

  return function teardown() {};
}

/* ==========================================================================
   Get App
   ========================================================================== */

async function renderGetApp(container) {
  container.appendChild(h(`
    <div class="page settings-page">
      ${backHeaderHTML("Get App")}
      <div id="get-app-body">${skeleton("height:120px;")}</div>
    </div>
  `));
  wireBackButton();

  const bodyEl = qs("#get-app-body");

  function paint(available) {
    if (isRunningStandalone()) {
      bodyEl.innerHTML = `
        <div class="empty-state">
          <div style="font-size:30px;">✅</div>
          <p style="max-width:280px;">You're already using the installed app.</p>
        </div>`;
      return;
    }
    if (!available) {
      bodyEl.innerHTML = `
        <div class="empty-state">
          <div style="font-size:30px;">📱</div>
          <p style="max-width:280px;">Installing isn't available in this browser right now. Try opening this page in Chrome, Edge, or Safari.</p>
        </div>`;
      return;
    }
    bodyEl.innerHTML = `
      <div class="card">
        <div class="eyebrow" style="margin-bottom:8px;">Install e-CON</div>
        <p class="text-muted" style="margin-bottom:12px;">Add it to your home screen — no browser bar, opens instantly.</p>
        <button class="btn btn--primary" id="install-btn" style="width:100%;">Install app</button>
      </div>`;
    qs("#install-btn").addEventListener("click", async () => {
      const accepted = await promptInstall();
      if (accepted) showToast("Installed! Look for e-CON on your home screen.", "success");
    });
  }

  paint(isInstallAvailable());
  const unsub = onInstallAvailabilityChange(paint);

  return function teardown() {
    unsub?.();
  };
}

/* ==========================================================================
   About
   ========================================================================== */

async function renderAbout(container) {
  const rows = [
    { route: "help", label: "Help", sub: "Get help with IUDEX" },
    { route: "support", label: "Support", sub: "Get support" },
    { route: "contact", label: "Contact", sub: "Contact the IUDEX team" },
    { route: "policies", label: "Privacy & Policies", sub: "Privacy, terms and policies" }
  ];

  container.appendChild(h(`
    <div class="page settings-page">
      ${backHeaderHTML("About")}
      <div class="eyebrow settings-section-label">Support</div>
      <div class="settings-menu">
        ${rows.map((r) => `
          <button class="settings-menu-item" data-route="${r.route}">
            <span class="settings-menu-text">
              <span class="settings-menu-label">${escapeHTML(r.label)}</span>
              <span class="settings-menu-sub">${escapeHTML(r.sub)}</span>
            </span>
            <span class="user-row-chevron" aria-hidden="true">›</span>
          </button>`).join("")}
      </div>
      <div class="eyebrow settings-section-label">General</div>
      <div class="card settings-row settings-version">
        <span class="text-muted">Version</span>
        <span>1.0</span>
      </div>
    </div>
  `));
  wireBackButton();

  qs(".settings-menu").addEventListener("click", (e) => {
    const btn = e.target.closest(".settings-menu-item");
    if (btn) navigate(btn.dataset.route);
  });

  return function teardown() {};
}

/* ==========================================================================
   Entry point
   ========================================================================== */

const SECTIONS = {
  account: renderAccount,
  privacy: renderPrivacy,
  "get-app": renderGetApp,
  about: renderAbout
};

export async function render(container, ctx = {}) {
  const section = SECTIONS[ctx.param];
  return section ? section(container) : renderMenu(container);
}
