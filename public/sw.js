/*
 * EduFunHub service worker. Keeps the app installable and usable on a flaky
 * connection: hashed build assets and icons are cached, pages always come
 * from the network (they carry the session and live points), and an offline
 * page is shown when the network is gone. Game WebSockets, APIs and
 * notification polling are never cached.
 */
const VERSION = 'edufunhub-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/pwa-192.png', '/pwa-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

function isStaticAsset(url) {
    return url.pathname.startsWith('/build/assets/') || /^\/pwa-[a-z0-9-]+\.png$/.test(url.pathname) || url.pathname === '/favicon.svg';
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
        return;
    }

    if (isStaticAsset(url)) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((response) => {
                        if (response.ok) {
                            const copy = response.clone();
                            caches.open(VERSION).then((cache) => cache.put(request, copy));
                        }
                        return response;
                    }),
            ),
        );
    }
});
