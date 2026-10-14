/* Avisos genéricos: o conteúdo privado só é exibido após entrar no sistema. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
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
