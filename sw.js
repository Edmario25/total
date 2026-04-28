// ─── Orações Diárias — Service Worker v1.2 ──────────────────────
const CACHE_NAME = 'oracoes-v1.2';

// Recursos estáticos cacheados no install
const STATIC_ASSETS = [
  './index.html',
  './app.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// CDN resources — cache depois do primeiro carregamento
const CDN_ORIGINS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
];

// APIs que NUNCA devem ser cacheadas
const BYPASS_ORIGINS = [
  'supabase.apicesystem.shop',
  'n8n.apicesystem.shop',
  'liturgia.up.railway.app',
  'evolution.apicesystem.shop',
  'api.openai.com',
];

// ── Install: pré-cachear estáticos ─────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpar caches antigos ────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => clients.claim())
  );
});

// ── Fetch: estratégia híbrida ───────────────────────────────────
self.addEventListener('fetch', (e) => {
  // Ignorar requests que não são GET
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // 1. APIs dinâmicas → sempre network (sem cache)
  if (BYPASS_ORIGINS.some((o) => url.host.includes(o))) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // 2. CDNs → Cache-first (se falhar, rede)
  if (CDN_ORIGINS.some((o) => url.host.includes(o))) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // 3. Recursos locais (app.html, icons, manifest) → Cache-first + update em background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return resp;
      });
      return cached || networkFetch;
    })
  );
});

// ── Push Notifications (placeholder) ────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json().catch(() => ({ title: 'Orações Diárias', body: e.data.text() }));
  e.waitUntil(
    data.then((d) =>
      self.registration.showNotification(d.title || 'Orações Diárias', {
        body: d.body || '🙏 Sua oração diária chegou!',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'oracao-diaria',
        renotify: true,
        data: { url: './app.html' },
      })
    )
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const existing = cs.find((c) => c.url.includes('app.html'));
      if (existing) return existing.focus();
      return clients.openWindow('./app.html');
    })
  );
});
