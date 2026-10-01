// ==========================================================================
// e-CON — App Entry Point
//
// Boot sequence:
//   loading  ->  watchAuthState  ->  one of:
//     signed-out      -> sign in / create account  (js/authScreen.js)
//     needs-username  -> claim @username           (js/usernameScreen.js)
//     ready           -> app shell + router
//
// The shell is built exactly once per session and torn down on sign-out, so
// the app bar/drawer and presence heartbeat aren't rewired on every auth callback.
// ==========================================================================

import { watchAuthState, completeRedirectSignIn } from "../firebase/auth.js";
import { registerRoute, initRouter, navigate, renderCurrentRoute } from "./router.js";
import { renderAuthScreen } from "./authScreen.js";
import { renderUsernameScreen } from "./usernameScreen.js";
import { renderAppBar } from "../components/appbar.js";
import { initPresence, stopPresence, setPresenceRoute } from "./presence.js";
import { migrateLegacyKeys } from "./storage.js";
import { loaderScreen } from "../components/loader.js";
import { showToast } from "../components/toast.js";
import "./installPrompt.js"; // side effect: catches beforeinstallprompt early
import { h } from "./utils.js";

const appEl = document.getElementById("app");

/* ---- Routes -------------------------------------------------------------
   "chats" is the default. "u" takes a @username, "chat" a conversation id.
   ------------------------------------------------------------------------- */
registerRoute("chats", () => import("../pages/home/home.js"));
registerRoute("discover", () => import("../pages/discover/discover.js"));
registerRoute("u", () => import("../pages/profile/profile.js"));
registerRoute("me", () => import("../pages/profile/profile.js"));
registerRoute("chat", () => import("../pages/chat/chat.js"));
registerRoute("settings", () => import("../pages/settings/settings.js"));
registerRoute("groupchats", () => import("../pages/groupchats/groupchats.js"));
registerRoute("community", () => import("../pages/community/community.js"));
// Reached only through Settings > About, not from the main drawer.
registerRoute("help", () => import("../pages/help/help.js"));
registerRoute("support", () => import("../pages/support/support.js"));
registerRoute("contact", () => import("../pages/contact/contact.js"));
registerRoute("policies", () => import("../pages/policies/policies.js"));

let shellMounted = false;
let setActiveNav = null;

function renderLoading() {
  appEl.classList.add("app--no-nav");
  appEl.innerHTML = "";
  appEl.appendChild(h(`<div>${loaderScreen()}</div>`));
}

function teardownShell() {
  appEl.classList.add("app--no-nav");
  shellMounted = false;
  setActiveNav = null;
  stopPresence();
  appEl.innerHTML = "";
}

function renderShell() {
  appEl.classList.remove("app--no-nav");
  appEl.innerHTML = `<main id="outlet"></main>`;
  const outlet = document.getElementById("outlet");

  setActiveNav = renderAppBar(appEl, (route) => navigate(route));

  initRouter(outlet, {
    onChange: (route, param) => {
      setActiveNav?.(route, param);
      setPresenceRoute(route);
    }
  });

  initPresence();
  renderCurrentRoute();
  shellMounted = true;
}

/* ---- Boot --------------------------------------------------------------- */

migrateLegacyKeys();
renderLoading();

// Resolve a pending Google redirect before the first auth callback lands,
// so a returning redirect doesn't flash the sign-in screen on the way in.
completeRedirectSignIn();

watchAuthState((state) => {
  switch (state.status) {
    case "signed-out":
      teardownShell();
      renderAuthScreen(appEl);
      break;

    case "needs-username":
      teardownShell();
      renderUsernameScreen(appEl, state);
      break;

    case "ready":
      if (!shellMounted) renderShell();
      break;

    case "error":
      teardownShell();
      appEl.appendChild(h(`
        <div class="empty-state" style="min-height:70vh;">
          <div style="font-size:34px;">⚠️</div>
          <h3 style="margin-bottom:8px;">Couldn't load your profile</h3>
          <p style="max-width:300px;">Check your connection, then reload. If this keeps happening, your Firestore rules may be blocking reads.</p>
          <button class="btn btn--ghost" style="margin-top:16px;" onclick="location.reload()">Reload</button>
        </div>
      `));
      showToast("Couldn't reach the database.", "error");
      break;
  }
});
