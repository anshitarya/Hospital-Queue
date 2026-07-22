// Service Worker for Hospital Queue (Turnos) Web Push Notifications
const SW_VERSION = 'v1.0.0';

self.addEventListener('install', (event) => {
  console.log(`[SW] Installing Service Worker ${SW_VERSION}`);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating Service Worker ${SW_VERSION}`);
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW] Push event received with no data.');
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Queue Update', body: event.data.text() };
  }

  const title = data.title || 'Turnos Queue Update';
  const options = {
    body: data.body || 'You have an update regarding your queue position.',
    icon: data.icon || '/logo-icon.png',
    badge: data.badge || '/logo-icon.png',
    tag: data.tag || 'turnos-notification',
    renotify: true,
    data: data.data || { url: '/patient' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there is an active focused window of the app
      const isVisibleAndFocused = clientList.some(
        (client) => client.visibilityState === 'visible' && client.focused,
      );

      // If active and focused, prefer live WebSocket updates and do not show duplicate background push banner
      if (isVisibleAndFocused) {
        console.log('[SW] App is open and focused. Suppressing duplicate system push notification.');
        return;
      }

      // Display system notification if app is closed, minimized, or inactive tab
      return self.registration.showNotification(title, options);
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/patient';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl) || client.url.includes('/patient')) {
            client.focus();
            if ('navigate' in client && client.url !== targetUrl) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
      }

      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed by user:', event.notification.tag);
});
