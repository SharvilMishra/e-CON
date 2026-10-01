// e-CON service worker. Bump this version when deploying changed static files.
const CACHE_NAME = "econ-static-v5";
const APP_SHELL_URL = new URL("/index.html", self.location.origin);
const STATIC_ICONS = new Set([
  "/assets/icons/android-chrome-192x192.png",
  "/assets/icons/android-chrome-512x512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/favicon-16x16.png",
  "/assets/icons/favicon-32x32.png",
  "/assets/icons/favicon.ico"
]);
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/assets/icons/android-chrome-192x192.png",
  "/assets/icons/android-chrome-512x512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/favicon-16x16.png",
  "/assets/icons/favicon-32x32.png",
  "/assets/icons/favicon.ico",
  "/css/animations.css",
  "/css/components.css",
  "/css/global.css",
  "/components/appbar.js",
  "/components/avatar.js",
  "/components/loader.js",
  "/components/modal.js",
  "/components/navdrawer.js",
  "/components/toast.js",
  "/firebase/auth.js",
  "/firebase/config.js",
  "/firebase/firestore.js",
  "/js/app.js",
  "/js/authScreen.js",
  "/js/installPrompt.js",
  "/js/navConfig.js",
  "/js/presence.js",
  "/js/router.js",
  "/js/storage.js",
  "/js/theme.js",
  "/js/ui.js",
  "/js/usernameScreen.js",
  "/js/utils.js",
  "/pages/chat/chat.js",
  "/pages/community/community.js",
  "/pages/contact/contact.js",
  "/pages/discover/discover.js",
  "/pages/groupchats/groupchats.js",
  "/pages/help/help.js",
  "/pages/home/home.js",
  "/pages/policies/policies.js",
  "/pages/profile/profile.js",
  "/pages/settings/settings.js",
  "/pages/support/support.js",
  "/services/conversations.js",
  "/services/usernames.js",
  "/services/users.js"
];

function isStaticAsset(url) {
  const path = url.pathname;
  return path === "/manifest.json" || STATIC_ICONS.has(path) ||
    /^\/(?:css|js|components|pages|services|firebase)\/.+\.(?:css|js)$/.test(path);
}

function isExpectedAssetResponse(url, response) {
  const type = response.headers.get("content-type") || "";
  if (url.pathname.endsWith(".js")) return /javascript|ecmascript/i.test(type);
  if (url.pathname.endsWith(".css")) return /text\/css/i.test(type);
  if (url.pathname.endsWith(".json")) return /json/i.test(type);
  if (/\.(?:png|ico)$/.test(url.pathname)) return /image\//i.test(type);
  return false;
}

function offlineResponse() {
  return new Response(`<!doctype html>
    <html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#060B14"><title>e-CON — Offline</title>
    <style>
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#060B14;color:#F8FAFC;font:16px/1.5 Inter,"Segoe UI",sans-serif}
      main{width:min(100%,420px);padding:32px;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:#0E1826;text-align:center}
      h1{margin:0 0 12px;font:700 28px Sora,"Segoe UI",sans-serif}p{margin:0;color:#CBD5E1}
    </style><main><h1>You're offline</h1><p>Some e-CON features need an internet connection. Reconnect and try again.</p></main></html>`, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Keep a missing optional asset from aborting installation of the worker.
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try { await cache.add(new URL(url, self.location.origin)); }
      catch (error) { console.warn("[e-CON sw] couldn't precache", url, error); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const oldCaches = await caches.keys();
    await Promise.all(oldCaches
      .filter((name) => name !== CACHE_NAME &&
        (name.startsWith("econ-") || name.startsWith("shideep-shell-")))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && (url.pathname === "/" || url.pathname === "/index.html")) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_SHELL_URL, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(APP_SHELL_URL) || offlineResponse();
      }
    })());
    return;
  }

  // Only known local static paths are eligible. Firebase, APIs, user data,
  // realtime traffic, and every other request use the browser's network path.
  if (!isStaticAsset(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic" && isExpectedAssetResponse(url, response)) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});
