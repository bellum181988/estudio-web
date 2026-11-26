// Guarda los archivos de la página para abrirla sin conexión. Primero intenta la red, para recibir las novedades.
const CACHE = 'estudio-prueba-1'
const FILES = ['./', 'index.html', 'app.js', 'config.js', 'estilos.css', 'manifest.webmanifest', 'icono.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Lo de Google (inicio de sesión y Drive) nunca se guarda.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)))
        }
        return res
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || Response.error()))
  )
})
