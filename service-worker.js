// ─── FIX : version incrémentée pour forcer la mise à jour du cache
// ⚠️ BUMP CE NUMÉRO à chaque modif de app.js/style.css/index.html pour que
// le navigateur détecte un changement de Service Worker et serve les fichiers frais.
const SW_VERSION = 77;
const CACHE_NAME = "intermitrack-v" + SW_VERSION;

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  // Force l'activation immédiate sans attendre la fermeture des onglets
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  // Prend le contrôle immédiatement de tous les onglets ouverts
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
    ])
  );
});

self.addEventListener("fetch", (event) => {
  // On ne gère QUE les requêtes de l'app (same-origin). Les ressources externes
  // (polices Google, CDN, Supabase…) passent directement par le navigateur —
  // sinon le service worker les re-fetch et le CSP connect-src les bloque.
  let sameOrigin = false;
  try { sameOrigin = new URL(event.request.url).origin === self.location.origin; } catch (e) {}
  if (!sameOrigin) return;
  // Network first : réseau d'abord, le cache = fallback hors-ligne.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
