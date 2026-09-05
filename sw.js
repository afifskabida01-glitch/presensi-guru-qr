/**
 * Service Worker untuk E_PGSkabida
 * - Menangani notifikasi push (future-ready)
 * - Menampilkan notifikasi pergantian jam bahkan saat tab tertutup
 * - Caching untuk akses offline
 */

const CACHE_NAME = 'epgskabida-cache-v6';
const SW_BASE = new URL('.', self.location.href);
const APP_BASE = SW_BASE.pathname;
const ASSETS_TO_CACHE = [
    new URL('./', SW_BASE).toString(),
    new URL('./index.html', SW_BASE).toString(),
    new URL('./style.css', SW_BASE).toString(),
    new URL('./app.js', SW_BASE).toString(),
    new URL('./logo.png', SW_BASE).toString(),
    new URL('./img_smk_bisa.png', SW_BASE).toString(),
    new URL('./firebase-config.js', SW_BASE).toString(),
    new URL('./jadwal_pelajaran_2026_27-1.png', SW_BASE).toString()
];

// Install event: cache assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
                console.warn('[SW] Cache addAll partial failure:', err);
            });
        })
    );
});

// Activate event: clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    return self.clients.claim();
});

// Fetch event: prefer network for the latest app files, but keep a cache fallback.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const isSameOrigin = request.url.startsWith(self.location.origin);
    const shouldUseNetworkFirst = request.mode === 'navigate' || request.destination === 'script' || request.destination === 'style' || request.destination === 'image';

    if (!isSameOrigin || request.method !== 'GET') {
        return;
    }

    event.respondWith(
        (shouldUseNetworkFirst ? fetch(request) : caches.match(request)).then((response) => {
            if (response && response.status === 200 && isSameOrigin) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
        }).catch(() => {
            return caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                if (request.mode === 'navigate') {
                    return caches.match(new URL('./index.html', self.location.href).toString());
                }

                return new Response('Offline', { status: 503 });
            });
        })
    );
});

// Push event: handle push notifications from server
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received:', event);
    
    let data = { title: 'E_PGSkabida', body: 'Ada notifikasi baru', tag: 'default' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: new URL('./logo.png', self.location.href).toString(),
        badge: new URL('./logo.png', self.location.href).toString(),
        vibrate: [200, 100, 200, 100, 200],
        tag: data.tag || 'epgskabida-notif',
        requireInteraction: true,
        data: data.data || {}
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click event: focus or open the app
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    
    event.notification.close();
    
    const urlToOpen = new URL('./index.html', self.location.href).toString();
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((windowClients) => {
            // Check if there's already a window/tab open
            for (let client of windowClients) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
