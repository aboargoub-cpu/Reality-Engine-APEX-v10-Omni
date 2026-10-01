const CACHE_NAME = "re-apex-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles-v11-clean.css",
  "./styles-v12-mobile.css",
  "./app-storage.js",
  "./app-core.js",
  "./app-cloud.js",
  "./app-msgraph.js",
  "./app-primavera.js",
  "./app-digitaltwin.js",
  "./app-notification-engine.js",
  "./app-time-machine.js",
  "./app-document-management.js",
  "./app-media.js",
  "./app-charts.js",
  "./app-financial.js",
  "./app-gantt.js",
  "./app-ui.js",
  "./app-modules.js",
  "./app-security.js",
  "./app-repository.js",
  "./app-domain-repositories.js",
  "./app-workflow-service.js",
  "./app-event-service.js",
  "./app-ai-provider.js",
  "./app-ai-gateway.js",
  "./app-search-graph.js",
  "./app-views.js",
  "./app-main.js",
  "./app-apex.js",
  "./app-apex9.js",
  "./app-field8.js",
  "./app-v9-ultimate.js",
  "./app-v10-omni.js",
  "./app-v11-clean.js",
  "./app-v12-mobile.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
  "./icons/icon-167.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => {});
          return res;
        })
        .catch(() => cached || Response.error());
    })
  );
});
