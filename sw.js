/* Guarda o app no celular para abrir sem internet. Os dados ficam no próprio app (e no OneDrive pela sincronização). */
const VERSAO = "faltas-v5";
const ARQUIVOS = ["./", "index.html", "app.css", "app.js", "sync.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;   // Microsoft/OneDrive nunca passam pelo cache
  e.respondWith(caches.open(VERSAO).then(async c => {
    const guardado = await c.match(e.request, { ignoreSearch: true });
    const rede = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return guardado || (await rede) || new Response("Sem internet", { status: 503 });
  }));
});
