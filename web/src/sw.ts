/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/** Уведомление «голосом курьера»: значок и вибрация зависят от курьера. */
const VIBRATE: Record<string, number[]> = {
  pigeon: [60, 40, 60, 40, 60], falcon: [30, 20, 30], owl: [200, 100, 200], snail: [400], horse: [40, 60, 40, 60, 40, 60],
  dogs: [80, 50, 80], sailboat: [500, 100, 300], airship: [300], bottle: [100, 200, 100], post: [120, 80, 120],
};

self.addEventListener('push', (event) => {
  let data: any = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  const courier = data.courier ?? 'pigeon';
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Colomba', {
      body: data.body ?? '',
      icon: `${self.registration.scope}icons/icon-192.png`,
      badge: `${self.registration.scope}icons/badge.png`,
      tag: data.tag,
      data: { url: data.url ?? '#/' , courier },
      // @ts-expect-error vibrate есть не во всех типах
      vibrate: VIBRATE[courier] ?? [100],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = `${self.registration.scope}${event.notification.data?.url ?? ''}`;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).navigate(url).catch(() => {});
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
