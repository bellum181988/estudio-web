'use strict'
// Página de prueba (fase 1): inicio de sesión de Google y carpeta oculta de Drive, con datos inventados.
// El registro nunca contiene el permiso (token) de Google.

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const CLIENT_ID = (window.CONFIG && window.CONFIG.clientId) || ''
const PREFIX = 'prueba-'
// Todas las páginas de usuario.github.io comparten almacenamiento: las claves llevan prefijo propio.
const KEY = { token: 'estudioPrueba.token', state: 'estudioPrueba.state', log: 'estudioPrueba.log' }

const $ = (id) => document.getElementById(id)
const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
const device = /iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : 'web'
const redirectUri = location.origin + location.pathname.replace(/index\.html$/, '')

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // sin almacenamiento: la prueba sigue, pero no recordará nada
  }
}

let memoryLog = read(KEY.log) || []
function log(text) {
  const stamp = new Date().toLocaleString('es-ES')
  memoryLog = [...memoryLog, `${stamp} [${standalone ? 'icono' : 'navegador'}] ${text}`].slice(-100)
  write(KEY.log, memoryLog)
  $('registro').textContent = memoryLog.join('\n')
}

let token = read(KEY.token) // { value, expiresAt, obtainedAt }
const tokenValid = () => !!token && Date.now() < token.expiresAt

function refreshStatus() {
  $('modo').textContent = standalone ? 'Icono de la pantalla de inicio' : 'Navegador'
  $('red').textContent = navigator.onLine ? 'Sí' : 'No'
  if (!token) $('permiso').textContent = 'Sin conectar'
  else {
    const min = Math.round((token.expiresAt - Date.now()) / 60000)
    $('permiso').textContent = min > 0 ? `Vigente, quedan ${min} min` : `Caducado hace ${-min} min`
  }
}

function saveToken(value, expiresIn, how) {
  const seconds = Number(expiresIn) || 0
  token = { value, obtainedAt: Date.now(), expiresAt: Date.now() + seconds * 1000 }
  write(KEY.token, token)
  log(`Conectado con ${how}. Google da ${Math.round(seconds / 60)} min de permiso.`)
  refreshStatus()
}

/* ---------- Ventana emergente (biblioteca de Google) ---------- */

let tokenClient = null
function loadGoogle() {
  if (!CLIENT_ID || !navigator.onLine) return
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client'
  s.onload = () => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error) return log(`Ventana: Google devolvió «${r.error}».`)
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return log('Ventana: no se concedió el acceso a la carpeta de la app.')
        saveToken(r.access_token, r.expires_in, 'ventana emergente')
      },
      error_callback: (e) => log(`Ventana: no se completó (${e.type}).`)
    })
    $('ventana').disabled = false
  }
  s.onerror = () => log('No se pudo cargar la biblioteca de Google.')
  document.head.appendChild(s)
}

/* ---------- Redirección ---------- */

function startRedirect() {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  write(KEY.state, state)
  const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'token', scope: SCOPE, state })
  log('Redirección: saliendo hacia Google…')
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`)
}

function finishRedirect() {
  const p = new URLSearchParams(location.hash.slice(1))
  if (!p.has('access_token') && !p.has('error')) return
  history.replaceState(null, '', location.pathname + location.search) // el permiso no se queda en la dirección
  const expected = read(KEY.state)
  write(KEY.state, null)
  if (!expected || p.get('state') !== expected) return log('Redirección: respuesta rechazada (no coincide con la petición, o el icono no conserva los datos al volver).')
  if (p.has('error')) return log(`Redirección: Google devolvió «${p.get('error')}».`)
  if (!(p.get('scope') || '').split(' ').includes(SCOPE)) return log('Redirección: no se concedió el acceso a la carpeta de la app.')
  saveToken(p.get('access_token'), p.get('expires_in'), 'redirección')
}

/* ---------- Drive ---------- */

async function drive(url, options = {}) {
  if (!tokenValid()) throw new Error('No hay permiso vigente: conecta primero.')
  const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token.value}` } })
  if (res.status === 401) {
    token = null
    write(KEY.token, null)
    refreshStatus()
    throw new Error('Google rechazó el permiso (401): vuelve a conectar.')
  }
  if (!res.ok) throw new Error(`Drive respondió ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res
}

async function testFiles() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', fields: 'files(id,name,createdTime)', orderBy: 'createdTime desc', pageSize: '100' })
  const data = await (await drive(`https://www.googleapis.com/drive/v3/files?${q}`)).json()
  return (data.files || []).filter((f) => f.name.startsWith(PREFIX))
}

async function list() {
  const files = await testFiles()
  const items = []
  for (const f of files.slice(0, 20)) {
    const text = await (await drive(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`)).text()
    const li = document.createElement('li')
    li.textContent = `${f.name} — ${text.slice(0, 200)}`
    items.push(li)
  }
  $('archivos').replaceChildren(...items)
  const from = (prefix) => files.filter((f) => f.name.startsWith(PREFIX + prefix + '-')).length
  log(`Archivos de prueba: ${files.length} (iPhone ${from('iphone')}, PC ${from('pc')}, otro navegador ${from('web')}).`)
}

async function create() {
  const name = `${PREFIX}${device}-${Date.now()}.json`
  const boundary = 'estudio-' + Date.now()
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ pelicula: 'Película inventada', origen: device })}\r\n--${boundary}--`
  await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  })
  log(`Creado ${name}.`)
  await list()
}

async function remove() {
  if (!confirm('¿Borrar los archivos de prueba de la carpeta oculta?')) return
  const files = await testFiles()
  for (const f of files) await drive(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' })
  log(`Borrados ${files.length} archivos de prueba.`)
  await list()
}

/* ---------- Arranque ---------- */

const run = (fn) => () => fn().catch((e) => log(e.message))

$('registro').textContent = memoryLog.join('\n')
$('ventana').disabled = true
$('redireccion').disabled = !CLIENT_ID
$('ventana').onclick = () => tokenClient && tokenClient.requestAccessToken()
$('redireccion').onclick = startRedirect
$('olvidar').onclick = () => {
  token = null
  write(KEY.token, null)
  refreshStatus()
  log('Permiso olvidado en este dispositivo (no se ha retirado en la cuenta de Google).')
}
$('listar').onclick = run(list)
$('crear').onclick = run(create)
$('borrar').onclick = run(remove)
$('copiar').onclick = () =>
  navigator.clipboard.writeText(memoryLog.join('\n')).then(
    () => log('Registro copiado.'),
    () => log('No se pudo copiar: selecciónalo a mano.')
  )
$('limpiar').onclick = () => {
  memoryLog = []
  write(KEY.log, null)
  $('registro').textContent = ''
}

if (!CLIENT_ID) log('Falta el ID de cliente en config.js: todavía no se puede conectar.')
finishRedirect()
refreshStatus()
loadGoogle()
setInterval(refreshStatus, 30000)
addEventListener('online', () => {
  refreshStatus()
  if (!tokenClient) loadGoogle()
})
addEventListener('offline', refreshStatus)

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((ok) => ($('persistente').textContent = ok ? 'Concedido' : 'No concedido'))
} else $('persistente').textContent = 'No disponible'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => ($('offline').textContent = 'Preparado'))
    .catch(() => ($('offline').textContent = 'No disponible'))
} else $('offline').textContent = 'No disponible'
