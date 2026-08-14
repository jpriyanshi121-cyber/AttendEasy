self.addEventListener("fetch", () => {
  // No caching strategy here on purpose — just a pass-through handler.
  // Chrome/Android only treats a site as a "real" installable PWA (app
  // name in push notifications, proper standalone window) when the
  // service worker has a fetch listener at all; without one, "Add to
  // Home Screen" creates a plain bookmark shortcut instead, and push
  // notifications from a bookmark always show the raw origin URL.
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "AttendEasy";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});