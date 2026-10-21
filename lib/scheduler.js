/**
 * 小黑盒生物钟 —— 按作息窗口随机醒来，自己逛一圈。
 *
 * 2026-10-21 改：不再依赖 `ctx.sessionController.prompt` 叫醒 agent。
 * 实测在当前 DSH 版本上，对空会话的 prompt 不会落进会话（会话文件只有头），
 * 所以改为到点直接执行 `heybox.mjs night`：拉信息流、挑帖、点赞、写日记。
 * 不经过 agent，但「随机醒」保证能用。
 *
 * 状态：~/.dsh/heybox-night.json（与配置 hash 绑定，你改窗口/配置后会自动重排）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

const TICK_MS = 60_000

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
const today = () => new Date().toLocaleDateString('sv-SE')

function toMin(hhmm) {
  const [h, m] = String(hhmm ?? '').split(':').map(Number)
  return (h === 24 ? 1440 : h * 60) + (m || 0)
}

function fmt(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function findNode() {
  const home = process.env.USERPROFILE || os.homedir()
  const dshHome = process.env.DSH_HOME || path.join(home, '.dsh')
  const cands = [
    process.env.DSH_NODE,
    path.join(dshHome, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe'),
    process.execPath,
  ]
  for (const c of cands) {
    try { if (c && fs.existsSync(c)) return c } catch { /* 忽略 */ }
  }
  return process.execPath
}

export function startScheduler(ctx, opts) {
  const {
    dshHome,
    toolsMjs,          // 指向 tools/heybox.mjs
    log = () => {},
  } = opts

  const STATE = path.join(dshHome, 'heybox-night.json')
  const CFG = path.join(dshHome, 'heybox.config.json')
  const NODE_EXE = findNode()

  const readCfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')) } catch { return {} } }
  const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return null } }
  const writeState = (o) => {
    try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(o, null, 2) + '\n') } catch { /* 忽略 */ }
  }

  let timer = null
  let waking = false
  let invalidated = false

  /** 配置指纹：窗口/概率/条数一变就重排，避免被旧状态卡住 */
  function configHash(cfg) {
    return JSON.stringify({ n: cfg.night ?? {} })
  }

  function planToday(cfg) {
    const night = cfg?.night ?? {}
    const wins = Array.isArray(night.windows) && night.windows.length
      ? night.windows
      : [{ start: '20:00', end: '23:00', wakes: 1 }]
    const skipChance = Number(night.skipChance ?? 0.25)
    const t = today()
    const now = nowMin()

    const candidates = []
    for (const w of wins) {
      const s = toMin(w.start)
      const e = toMin(w.end)
      const wakes = Math.max(1, Number(w.wakes ?? 1))
      for (let i = 0; i < wakes; i += 1) {
        const lo = Math.max(s, now)   // 窗口内可以立即触发（测试/补醒用）
        if (lo >= e) continue
        candidates.push({ lo, hi: e, window: `${w.start}–${w.end}` })
      }
    }

    if (!candidates.length) return { date: t, action: 'done', at: 1440, atText: '—', hash: configHash(cfg) }

    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const at = pick.lo + Math.floor(Math.random() * Math.max(1, pick.hi - pick.lo))
    const base = { date: t, at, atText: fmt(at), window: pick.window, fired: false, hash: configHash(cfg) }
    if (Math.random() < skipChance) return { ...base, action: 'skip' }
    return { ...base, action: 'wake' }
  }

  function runNight(args = []) {
    return new Promise((resolve) => {
      if (!toolsMjs || !fs.existsSync(toolsMjs)) {
        resolve({ ok: false, out: '', err: `找不到 ${toolsMjs}` })
        return
      }
      execFile(NODE_EXE, [toolsMjs, 'night', '--json', ...args], {
        timeout: 120_000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        resolve({ ok: !err, out: String(stdout ?? '').trim(), err: String(stderr ?? '').trim() })
      })
    })
  }

  async function tick() {
    if (waking) return
    const cfg = readCfg()
    if (cfg?.night?.enabled === false) return

    const t = today()
    const hash = configHash(cfg)
    let st = readState()

    if (invalidated) { st = null; invalidated = false }

    // 配置变了（窗口/概率/条数）→ 重排
    if (st && st.hash !== hash) {
      st = null
      try { fs.rmSync(STATE, { force: true }) } catch { /* 忽略 */ }
    }

    if (!st || st.date !== t) {
      st = planToday(cfg)
      writeState(st)
      log(`[dsh-heybox] 今日计划：${st.action} @ ${st.atText ?? ''}${st.window ? `（${st.window}）` : ''}`)
      return
    }
    if (st.action === 'done' || st.fired) return
    if (nowMin() < Number(st.at)) return

    waking = true
    try {
      const args = st.action === 'skip' ? ['--skip'] : []
      const r = await runNight(args)
      writeState({ ...st, fired: true, woke: true, wokeAt: new Date().toISOString(), ok: r.ok, out: (r.out || r.err).slice(0, 400) })
      log(`[dsh-heybox] 醒来 · ${st.action} · ${r.ok ? '完成' : '失败'} · ${(r.out || r.err).slice(0, 160)}`)
    } catch (e) {
      log(`[dsh-heybox] 醒来失败：${String(e?.message ?? e).slice(0, 120)}`)
    } finally {
      waking = false
    }
  }

  timer = setInterval(() => { tick().catch(() => {}) }, TICK_MS)
  tick().catch(() => {})

  return {
    /** 设置保存后调用：清掉今天的计划，下一次 tick 按新配置重算 */
    invalidate() {
      invalidated = true
      try { fs.rmSync(STATE, { force: true }) } catch { /* 忽略 */ }
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
