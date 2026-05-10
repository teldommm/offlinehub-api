const express = require('express')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 8080
const API_DIR = path.join(__dirname, 'api')

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ─── Static binary components ─────────────────────────────────────────────────
// Must be declared BEFORE all app.all() routes so that .tzst and other
// binary files are served directly without going through the text sendFile helper.
// Files are served from: ~/gamehub/components/

app.use('/components', express.static(path.join(__dirname, 'components')))
app.use('/card/wallpaper', express.static(path.join(API_DIR, 'card', 'wallpaper')))

// ─── Component type → manifest file mapping ──────────────────────────────────
// Mirrors the original Cloudflare Worker logic.
// The app sends a POST to /simulator/v2/getComponentList with a `type` field.
// Each type maps to a different manifest JSON file in api/components/.
//
// To add a new component type: add a new entry here and place the manifest
// file at api/components/<your_manifest_name>.

const TYPE_TO_MANIFEST = {
  1: 'components/box64_manifest',     // Box64 / FEX emulation layer
  2: 'components/drivers_manifest',   // GPU drivers (Turnip, etc.)
  3: 'components/dxvk_manifest',      // DXVK (DirectX → Vulkan)
  4: 'components/vkd3d_manifest',     // VKD3D-Proton (DX12 → Vulkan)
  5: 'components/games_manifest',     // Game-specific components
  6: 'components/libraries_manifest', // Runtime libraries (Wine, etc.)
  7: 'components/steam_manifest',     // Steam client components
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(method, url, source) {
  const time = new Date().toTimeString().slice(0, 8)
  console.log(`[${time}] ${method.padEnd(4)} ${url.padEnd(45)} → ${source}`)
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(path.join(API_DIR, filePath), 'utf8')
}

// Reads a JSON file from api/ and sends it as the response.
// Returns { code: 0, msg: 'not found' } if the file does not exist.
function sendFile(res, filePath, req) {
  try {
    const content = readFile(filePath)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.send(content)
    log(req.method, req.path, filePath)
  } catch {
    log(req.method, req.path, `404 (${filePath})`)
    res.status(200).json({ code: 0, msg: 'not found', data: null })
  }
}

// Returns a minimal success response for endpoints that require no real data.
// Used for Chinese-server-only endpoints and analytics calls.
function stub(res, req, data = {}) {
  log(req.method, req.path, 'stub')
  res.json({ code: 200, msg: 'success', data })
}

// ─── JWT ──────────────────────────────────────────────────────────────────────
// The app always sends "fake-token". The server accepts it and returns a static
// token response. No real authentication is performed.

app.all('/jwt/refresh', (req, res) => sendFile(res, 'jwt/refresh/token', req))

// ─── Base ─────────────────────────────────────────────────────────────────────

app.all('/base/getBaseInfo', (req, res) => sendFile(res, 'base/getBaseInfo', req))

// ─── Simulator: getComponentList with type-based routing ─────────────────────
// This is the most important endpoint. The app requests components filtered
// by type (e.g. type=3 for DXVK). The server reads the correct manifest,
// transforms data.components → data.list (matching original Worker logic),
// and applies pagination before returning the response.
//
// How to add a new component to an existing type:
//   1. Place the .tzst file in ~/gamehub/components/
//   2. Edit the manifest at ~/gamehub/api/components/<type>_manifest
//   3. Add an entry to data.components[] with download_url pointing to
//      http://127.0.0.1:8080/components/<filename.tzst>

app.all('/simulator/v2/getComponentList', async (req, res) => {
  let type, page, pageSize

  if (req.method === 'POST') {
    type = req.body?.type
    page = req.body?.page || 1
    pageSize = req.body?.page_size || 10
  } else {
    type = Number(req.query.type) || undefined
    page = Number(req.query.page) || 1
    pageSize = Number(req.query.page_size) || 10
  }

  const manifestPath = TYPE_TO_MANIFEST[type]

  if (!type || !manifestPath) {
    log(req.method, req.path, `invalid type=${type}`)
    return res.status(200).json({ code: 400, msg: 'Invalid type parameter' })
  }

  try {
    const manifestData = JSON.parse(readFile(manifestPath))

    // Transform components → list to match original Worker response format
    if (manifestData.data && manifestData.data.components) {
      manifestData.data.list = manifestData.data.components
      delete manifestData.data.components
    }

    // Apply pagination
    if (manifestData.data && manifestData.data.list) {
      const allItems = manifestData.data.list
      const total = manifestData.data.total || allItems.length
      const startIndex = (page - 1) * pageSize
      manifestData.data.list = allItems.slice(startIndex, startIndex + pageSize)
      manifestData.data.page = page
      manifestData.data.pageSize = pageSize
      manifestData.data.total = total
    }

    log(req.method, req.path, `${manifestPath} (type=${type})`)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.json(manifestData)
  } catch (e) {
    log(req.method, req.path, `error: ${e.message}`)
    res.status(200).json({ code: 500, msg: 'Failed to read manifest' })
  }
})

// ─── Simulator: remaining endpoints ──────────────────────────────────────────

app.all('/simulator/v2/getAllComponentList', (req, res) =>
  sendFile(res, 'simulator/v2/getAllComponentList', req))

app.all('/simulator/v2/getContainerList', (req, res) =>
  sendFile(res, 'simulator/v2/getContainerList', req))

app.all('/simulator/v2/getDefaultComponent', (req, res) =>
  sendFile(res, 'simulator/v2/getDefaultComponent', req))

app.all('/simulator/v2/getImagefsDetail', (req, res) =>
  sendFile(res, 'simulator/v2/getImagefsDetail', req))

// Snapdragon 8 Elite → use Qualcomm-optimised executeScript preset
app.all('/simulator/executeScript', (req, res) =>
  sendFile(res, 'simulator/executeScript/qualcomm', req))

app.all('/simulator/getTabList', (req, res) =>
  sendFile(res, 'simulator/getTabList', req))

// Returns empty data for local game detail lookups (no Chinese server)
app.all('/simulator/getLocalGameDetail', (req, res) => stub(res, req, {}))

// ─── Components: direct manifest access ──────────────────────────────────────
// Handles requests like GET/POST /components/dxvk_manifest directly.
// express.static above handles binary .tzst downloads from ~/gamehub/components/.

app.all('/components/:name', (req, res) =>
  sendFile(res, `components/${req.params.name}`, req))

// ─── Card ─────────────────────────────────────────────────────────────────────

app.all('/card/getGameIcon',    (req, res) => sendFile(res, 'card/getGameIcon', req))
app.all('/card/getCtsList',     (req, res) => sendFile(res, 'card/getCtsList', req))
app.all('/card/getTopPlatform', (req, res) => sendFile(res, 'card/getTopPlatform', req))
app.all('/card/getNewsList',    (req, res) => sendFile(res, 'card/getNewsList', req))

// Stubs — these endpoints require the Chinese server and are not supported locally
app.all('/card/getGameDetail', (req, res) => stub(res, req, {
  game_name: '', game_icon: '', banner_list: [],
  recommend_game: [], card_line_data: []
}))
app.all('/card/getNewsGuideDetail', (req, res) => stub(res, req, {
  title: '', content: '', create_time: ''
}))

// code: 201 matches the original Worker's "no free games" response
app.all('/card/getIndexList', (req, res) => {
  log(req.method, req.path, 'stub')
  res.json({ code: 201, msg: 'No free games available', data: [], time: String(Math.floor(Date.now() / 1000)) })
})

// code: 0 matches the original Worker response format for this endpoint
app.all('/card/more', (req, res) => {
  log(req.method, req.path, 'stub')
  res.json({ code: 0, msg: '', time: String(Math.floor(Date.now() / 1000)), data: { card_list: [], page: 1, page_size: 30 } })
})

// ─── Search ───────────────────────────────────────────────────────────────────

app.all('/search/getGameList', (req, res) => stub(res, req, {
  list: [], total: [{ classify_group_id: 0, count: 0 }], all_game_ids: []
}))

// ─── Cloud ────────────────────────────────────────────────────────────────────

app.all('/cloud/game/check_user_timer', (req, res) =>
  sendFile(res, 'cloud/game/check_user_timer', req))

// ─── Game ─────────────────────────────────────────────────────────────────────

// getSteamHost returns plain text (list of Steam CDN IPs), not JSON
app.all('/game/getSteamHost', (req, res) => {
  try {
    const content = readFile('game/getSteamHost/index')
    log(req.method, req.path, 'game/getSteamHost/index')
    res.setHeader('Content-Type', 'text/plain')
    res.send(content)
  } catch {
    log(req.method, req.path, '404 (getSteamHost)')
    res.status(200).send('')
  }
})

app.all('/game/getDnsIpPool',           (req, res) => sendFile(res, 'game/getDnsIpPool', req))
app.all('/game/checkLocalHandTourGame', (req, res) => sendFile(res, 'game/checkLocalHandTourGame', req))
app.all('/game/getGameCircleList',      (req, res) => sendFile(res, 'game/getGameCircleList', req))
app.all('/game/userVideoNum',           (req, res) => sendFile(res, 'game/userVideoNum', req))
app.all('/game/cts/report',             (req, res) => sendFile(res, 'game/cts/report', req))

// ─── Heartbeat ────────────────────────────────────────────────────────────────
// Heartbeat calls track active game sessions. Stubbed with the correct
// nested response format { code: 200, data: { code: 0, msg: 'ok' } }.

app.all('/heartbeat/game/start', (req, res) => {
  log(req.method, req.path, 'heartbeat stub')
  res.json({ code: 200, msg: 'Success', time: String(Math.floor(Date.now() / 1000)), data: { code: 0, msg: 'ok' } })
})

app.all('/heartbeat/game/stop', (req, res) => {
  log(req.method, req.path, 'heartbeat stub')
  res.json({ code: 200, msg: 'Success', time: String(Math.floor(Date.now() / 1000)), data: { code: 0, msg: 'ok' } })
})

app.all('/heartbeat/game/getUserPlayTimeList', (req, res) =>
  sendFile(res, 'heartbeat/game/getUserPlayTimeList', req))

app.all('/heartbeat/*', (req, res) => stub(res, req))

// ─── Upgrade ──────────────────────────────────────────────────────────────────
// Returns static upgrade info — the app will not prompt for updates.

app.all('/upgrade/getAppUpgradeApk', (req, res) =>
  sendFile(res, 'upgrade/getAppUpgradeApk', req))

// ─── Devices ──────────────────────────────────────────────────────────────────

app.all('/devices/getDevicesList', (req, res) =>
  sendFile(res, 'devices/getDevicesList', req))

// ─── User ─────────────────────────────────────────────────────────────────────

app.all('/user/info', (req, res) => sendFile(res, 'user/info', req))

// ─── EMS / Email ──────────────────────────────────────────────────────────────

app.all('/ems/send',    (req, res) => sendFile(res, 'ems/send', req))
app.all('/email/login', (req, res) => sendFile(res, 'email/login', req))

// ─── Agreement ────────────────────────────────────────────────────────────────

app.all('/agreement/*', (req, res) => {
  const sub = req.path.replace('/agreement/', '')
  sendFile(res, `agreement/${sub}`, req)
})

// ─── Connectivity check ───────────────────────────────────────────────────────
// The APK is patched to send its network probe here instead of
// connectivitycheck.gstatic.com and google.com/generate_204.
// Returns HTTP 204 to signal that the network is available.

app.get('/generate_204', (req, res) => {
  log(req.method, req.path, 'connectivity check')
  res.status(204).send()
})

// ─── Catch-all fallback ───────────────────────────────────────────────────────
// Any unknown route attempts to find a matching file in api/.
// Unknown requests appear in logs as catch-all entries — useful for
// discovering new endpoints that need explicit handling.

app.all('*', (req, res) => {
  const filePath = req.path.slice(1)
  log(req.method, req.path, `catch-all → ${filePath}`)
  sendFile(res, filePath, req)
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   GameHub Lite — Termux Worker               ║')
  console.log(`║   http://127.0.0.1:${PORT}                      ║`)
  console.log(`║   API: ${API_DIR}`)
  console.log('╚══════════════════════════════════════════════╝')
  console.log('')
})
