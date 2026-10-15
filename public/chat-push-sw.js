/* Registro único para instalação do app e avisos do chat.
 * Nunca guarda páginas autenticadas, consultas ou dados patrimoniais no cache. */
const OFFLINE_CACHE = "syspatrimonio-offline-v1";
const OFFLINE_PAGE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(OFFLINE_PAGE);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("syspatrimonio-offline-") && key !== OFFLINE_CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate" ||
      new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      return await fetch(event.request);
    } catch {
      return (await caches.match(OFFLINE_PAGE, { cacheName: OFFLINE_CACHE })) ||
        new Response("Sem conexão. Reconecte à internet e tente novamente.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }
  })());
});
self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("Patrimônio — nova mensagem", {
    body: "Você recebeu uma mensagem no chat. Entre no sistema para ler e responder.",
    tag: "patrimonio-chat",
    icon: "/favicon.ico",
    data: { url: "/departamentos" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL("/departamentos", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
