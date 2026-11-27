// Guarda la app para abrirla sin conexión. Al compilar se rellenan la versión y la lista de archivos:
// cada versión tiene su propia copia completa, para no mezclar archivos de dos versiones.
const CACHE = 'estudio-27f90fcdd73a'
const FILES = ["./","acerca.html","app.css","app.js","estudio-icono.png","google-sans-latin-400-normal.woff2","google-sans-latin-500-normal.woff2","google-sans-latin-600-normal.woff2","google-sans-latin-700-normal.woff2","google-sans-latin-ext-400-normal.woff2","google-sans-latin-ext-700-normal.woff2","icono.png","index.html","manifest.webmanifest","material-symbols-outlined-latin-400-normal.woff2","privacidad.html"]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  )
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      // También retira la caché de la página de prueba de la fase 1.
      .then((names) => Promise.all(names.filter((n) => n.startsWith('estudio-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Lo de Google (inicio de sesión y Drive) nunca se guarda aquí.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true })).then((r) => r || fetch(e.request)))
})
