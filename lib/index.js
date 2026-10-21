/**
 * dsh-heybox —— 宿主侧插件（设置壳）
 *
 * 职责：
 *   1. 配置读写：GET/POST /dsh-heybox/api/settings → ~/.dsh/heybox.config.json
 *   2. 凭据写入：POST /dsh-heybox/api/cookie → ~/.heybox-ai/credentials.json（永不回显）
 *   3. 依赖体检：GET /dsh-heybox/api/deps → 跑 tools/heybox.mjs selftest
 *   4. 状态：GET /dsh-heybox/api/status
 *
 * 所有写路由都过信任栅栏（DSH Web 端口是回环地址，但任意网页都能向回环发请求）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startQrLogin, pollQrLogin } from '../tools/lib/qrlogin.mjs'
import { startScheduler } from './scheduler.js'

// 二维码依赖按需加载：没装也不影响其它功能，也不用模块级 top-level await
let QRCode
async function loadQRCode() {
  if (QRCode !== undefined) return QRCode
  try { QRCode = (await import('qrcode')).default } catch { QRCode = null }
  return QRCode
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.USERPROFILE || os.homedir()
const DSH_HOME = process.env.DSH_HOME || path.join(HOME, '.dsh')
const CFG_FILE = process.env.HEYBOX_CONFIG || path.join(DSH_HOME, 'heybox.config.json')
const CRED_DIR = path.join(HOME, '.heybox-ai')
const CRED_FILE = path.join(CRED_DIR, 'credentials.json')
const COOKIE_TXT = path.join(CRED_DIR, 'cookie.txt')

// Electron 的 process.execPath 是 Harness.exe，跑不了 node 脚本
const NODE_EXE = (() => {
  const cands = [
    process.env.DSH_NODE,
    path.join(DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe'),
    process.execPath,
  ]
  for (const c of cands) {
    try { if (c && fs.existsSync(c)) return c } catch { /* 忽略 */ }
  }
  return process.execPath
})()

const DEFAULTS = {
  owner: { heyboxId: '', name: '' },
  interests: { games: [], topics: [] },
  feed: { limit: 20, onlySubscribed: false },
  like: { dailyLimit: 20 },
  notify: { type: 'none', url: '' },
  // 生物钟：窗口内随机醒来；skipChance 概率"今天不想看"
  night: {
    enabled: true,
    windows: [{ start: '20:00', end: '23:00', wakes: 1 }],
    skipChance: 0.25,
    maxItems: 3,
  },
}

const clone = (o) => JSON.parse(JSON.stringify(o))
const merge = (base, over) => {
  const out = { ...base }
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] ?? {}, v) : v
  }
  return out
}

function readConfig() {
  let user = {}
  try { user = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) } catch { /* 默认 */ }
  return { ...merge(DEFAULTS, user), __hasUserFile: Object.keys(user).length > 0 }
}

function writeConfig(next) {
  fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true })
  fs.writeFileSync(CFG_FILE, JSON.stringify(next, null, 2) + '\n')
}

function parseCookie(raw) {
  const out = {}
  if (!raw) return out
  for (const pair of String(raw).split(';')) {
    const i = pair.indexOf('=')
    if (i <= 0) continue
    const k = pair.slice(0, i).trim()
    const v = pair.slice(i + 1).trim()
    if (k) out[k] = v
  }
  return out
}

function readCookies() {
  let cookies = {}
  try {
    const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'))
    cookies = { ...parseCookie(cred.cookies) }
  } catch { /* 没有 */ }
  try {
    const txt = fs.readFileSync(COOKIE_TXT, 'utf8').trim()
    for (const [k, v] of Object.entries(parseCookie(txt))) if (!(k in cookies)) cookies[k] = v
  } catch { /* 没有 */ }
  return cookies
}

function credState() {
  const c = readCookies()
  return { present: Boolean(c.pkey || c.user_pkey), hasPkey: Boolean(c.pkey || c.user_pkey), heyboxId: String(c.heybox_id || c.user_heybox_id || '') }
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isLoopbackReq(req) {
  const h = String(req.headers?.host ?? '').toLowerCase().split(':')[0]
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1'
}

export default {
  name: 'dsh-heybox',
  inject: ['sessionController', 'webServer', 'connection'],
  apply(ctx) {
    let sched = null

    function rejected(req, res, { strict = true } = {}) {
      if (!isLoopbackReq(req)) {
        json(res, 403, { ok: false, error: '只接受本机回环访问' })
        return true
      }
      try {
        const conn = ctx.get('connection') || ctx.connection
        if (!conn || typeof conn.requestRejection !== 'function') {
          if (strict) { json(res, 503, { ok: false, error: '信任栅栏不可用，拒绝访问' }); return true }
          return false
        }
        const code = conn.requestRejection(req)
        if (code === undefined || code === null || code === false) return false
        res.statusCode = typeof code === 'number' ? code : 403
        res.end()
        return true
      } catch {
        if (strict) { json(res, 503, { ok: false, error: '信任栅栏异常，拒绝访问' }); return true }
        return false
      }
    }

    const disposers = []
    function route(kind, pathname, handler) {
      disposers.push(ctx.webServer.register({
        kind,
        path: pathname,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          try { await handler(req, res) } catch (err) {
            try { json(res, 500, { ok: false, error: String(err?.message ?? err) }) } catch { /* 忽略 */ }
          }
        },
      }))
    }

    // 配置：GET 读 / POST 写（只接受已知顶层字段）
    route('exact', '/dsh-heybox/api/settings', async (req, res) => {
      if (req.method === 'GET') {
        json(res, 200, { ok: true, config: readConfig(), credentials: credState(), configPath: CFG_FILE })
        return
      }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const body = JSON.parse(await readBody(req) || '{}')
      const incoming = body?.config && typeof body.config === 'object' ? body.config : body
      const cur = readConfig()
      delete cur.__hasUserFile
      const KNOWN = new Set(['owner', 'interests', 'feed', 'like', 'signin', 'notify', 'night'])
      const filtered = {}
      for (const [k, v] of Object.entries(incoming || {})) if (KNOWN.has(k)) filtered[k] = v
      const next = merge(cur, filtered)

      next.feed.limit = Math.min(50, Math.max(1, Number(next.feed.limit) || 20))
      next.like.dailyLimit = Math.min(100, Math.max(0, Number(next.like.dailyLimit) || 20))
      if (!Array.isArray(next.interests.games)) next.interests.games = []
      if (!Array.isArray(next.interests.topics)) next.interests.topics = []

      writeConfig(next)
      try { sched?.invalidate() } catch { /* 忽略 */ }
      json(res, 200, { ok: true, config: next, configPath: CFG_FILE })
    })

    // 扫码登录：生成二维码 + 轮询状态
    const qrSessions = new Map()

    route('exact', '/dsh-heybox/api/login/qr/start', async (req, res) => {
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const qrLib = await loadQRCode()
      if (!qrLib) {
        json(res, 500, { ok: false, error: '缺少 qrcode 依赖：在插件目录运行 pnpm add qrcode' })
        return
      }
      try {
        const { qrUrl, token, expire } = await startQrLogin()
        const dataUrl = await qrLib.toDataURL(qrUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
        qrSessions.set(token, { cookies: {}, createdAt: Date.now() })
        json(res, 200, { ok: true, token, qrUrl, expire, dataUrl })
      } catch (err) {
        json(res, 500, { ok: false, error: String(err?.message ?? err) })
      }
    })

    route('exact', '/dsh-heybox/api/login/qr/poll', async (req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1')
      const token = u.searchParams.get('token') ?? ''
      const sess = qrSessions.get(token)
      if (!sess) { json(res, 400, { ok: false, error: '扫码会话不存在，请重新生成' }); return }
      if (Date.now() - sess.createdAt > 180_000) {
        qrSessions.delete(token)
        json(res, 200, { ok: true, state: 'expired' })
        return
      }
      try {
        const out = await pollQrLogin(token, sess.cookies)
        sess.cookies = out.cookies
        if (out.state === 'ok') qrSessions.delete(token)
        json(res, 200, { ok: true, state: out.state, heyboxId: out.heyboxId ?? '', credentials: credState() })
      } catch (err) {
        json(res, 200, { ok: false, state: 'error', error: String(err?.message ?? err) })
      }
    })

    // 凭据：只写不读回
    route('exact', '/dsh-heybox/api/cookie', async (req, res) => {
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const body = JSON.parse(await readBody(req) || '{}')
      const incoming = parseCookie(body.cookie ?? body.raw ?? '')
      const current = readCookies()
      const merged = { ...current, ...incoming }
      if (merged.user_pkey && !merged.pkey) merged.pkey = merged.user_pkey
      if (merged.pkey && !merged.user_pkey) merged.user_pkey = merged.pkey
      if (merged.user_heybox_id && !merged.heybox_id) merged.heybox_id = merged.user_heybox_id
      if (merged.heybox_id && !merged.user_heybox_id) merged.user_heybox_id = merged.heybox_id

      if (!merged.pkey && !merged.user_pkey) {
        json(res, 400, { ok: false, error: '没有找到 pkey：请粘贴完整 Cookie（含 pkey）' })
        return
      }

      fs.mkdirSync(CRED_DIR, { recursive: true })
      fs.writeFileSync(CRED_FILE, JSON.stringify({ cookies: merged, savedAt: new Date().toISOString() }, null, 2) + '\n')
      try { fs.chmodSync(CRED_FILE, 0o600) } catch { /* Windows 忽略 */ }

      json(res, 200, {
        ok: true,
        detail: `已写入 ✓ 当前 heybox_id=${merged.heybox_id || merged.user_heybox_id || '（缺）'}`,
        credentials: credState(),
      })
    })

    // 状态
    route('exact', '/dsh-heybox/api/status', async (req, res) => {
      const cfg = readConfig()
      delete cfg.__hasUserFile
      let lastRun = null
      try {
        lastRun = JSON.parse(fs.readFileSync(path.join(DSH_HOME, 'heybox-last-run.json'), 'utf8'))
      } catch { /* 没有 */ }
      json(res, 200, { ok: true, config: cfg, credentials: credState(), lastRun, configPath: CFG_FILE })
    })

    // 依赖体检：跑 selftest 的文本输出
    route('exact', '/dsh-heybox/api/deps', async (req, res) => {
      const tools = process.env.HEYBOX_TOOLS || path.join(HERE, '..', 'tools', 'heybox.mjs')
      if (!fs.existsSync(tools)) {
        json(res, 200, { ok: false, error: `找不到 tools/heybox.mjs：${tools}`, items: [] })
        return
      }
      execFile(NODE_EXE, [tools, 'selftest'], { timeout: 60_000, windowsHide: true }, (err, stdout, stderr) => {
        const out = String(stdout || '')
        json(res, 200, {
          ok: !err,
          out: out.slice(0, 4000),
          err: String(stderr || '').slice(0, 1000),
          credentials: credState(),
        })
      })
    })

    // 生物钟：让 agent 按作息随机醒来逛一圈
    try {
      sched = startScheduler(ctx, {
        dshHome: DSH_HOME,
        cwd: HOME,
        sessionId: 'heybox',
        log: (m) => { try { console.log(m) } catch { /* 忽略 */ } },
      })
    } catch (e) {
      try { console.warn('[dsh-heybox] 生物钟启动失败：' + String(e?.message ?? e)) } catch { /* 忽略 */ }
    }

    ctx.effect(() => () => {
      try { sched?.stop() } catch { /* 忽略 */ }
      for (const d of disposers) { try { d() } catch { /* 忽略 */ } }
    })

    try { console.log(`[dsh-heybox] 设置页已挂载：/dsh-heybox/ · 配置 ${CFG_FILE}`) } catch { /* 忽略 */ }
  },
}
