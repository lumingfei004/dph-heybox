/**
 * 小黑盒生物钟 —— 让 agent 按自己的作息随机醒来，逛一圈黑盒。
 *
 * 做法（和 dsh-bili-whale 同一套思路）：
 *   · 插件宿主常驻 DSH，每 60 秒 tick 一次
 *   · 每天在作息窗口里随机一个时刻；按 skipChance 随机"今天不想看"
 *   · 到点用 ctx.sessionController.prompt 往专属会话塞一个「你醒了」的回合
 *   · 醒来后由 agent 自己读 AGENTS.md / 提示词，决定看什么、点赞、签到、写日记
 *
 * 状态存 ~/.dsh/heybox-night.json；配置改动调 invalidate() 立即重算。
 */
import fs from 'node:fs'
import path from 'node:path'

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

export function startScheduler(ctx, opts) {
  const {
    dshHome,
    cwd,
    sessionId = 'heybox',
    log = () => {},
  } = opts

  const STATE = path.join(dshHome, 'heybox-night.json')
  const CFG = path.join(dshHome, 'heybox.config.json')

  const readCfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')) } catch { return {} } }
  const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return null } }
  const writeState = (o) => {
    try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(o, null, 2) + '\n') } catch { /* 忽略 */ }
  }

  let timer = null
  let waking = false
  let sessionReady = false
  let invalidated = false

  async function ensureSession() {
    if (sessionReady) return
    try { await ctx.sessionController.create({ sessionId, cwd }) } catch { /* 已存在 */ }
    sessionReady = true
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
        const lo = Math.max(s, now + 1)
        if (lo >= e) continue
        candidates.push({ lo, hi: e, window: `${w.start}–${w.end}` })
      }
    }

    if (!candidates.length) return { date: t, action: 'done', at: 1440, atText: '—' }

    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const at = pick.lo + Math.floor(Math.random() * Math.max(1, pick.hi - pick.lo))
    const base = { date: t, at, atText: fmt(at), window: pick.window, fired: false }
    if (Math.random() < skipChance) return { ...base, action: 'skip' }
    return { ...base, action: 'wake' }
  }

  function wakePrompt(st, cfg) {
    const maxItems = Math.max(1, Number(cfg?.night?.maxItems ?? 3))
    const games = (cfg?.interests?.games ?? []).filter(Boolean)
    return [
      `【你醒了】现在是 ${st.atText ?? ''}${st.window ? `，作息窗口 ${st.window}` : ''}。`,
      '按「逛一圈」的流程自己走一遍，不用等用户说话：',
      `1) 跑 \`node tools/heybox.mjs feed --limit 12\` 看信息流${games.length ? `（优先这些游戏：${games.join('、')}）` : ''}`,
      `2) 挑 1–${maxItems} 条真的想看的，用 \`link <帖子ID>\` 看正文、\`comment <帖子ID>\` 看评论`,
      '3) 遇到真心喜欢的，用 `like <帖子ID> --go` 点个赞（别超过设置里的日上限）',
      '4) 在 ~/.dsh/heybox-diary.md 写一句今天逛黑盒的感受（用自己的话，不要汇报腔）',
      '5) 把最想跟用户分享的那一条（标题 + 一句为什么）简短说出来',
      '',
      '没有值得看的就少看、不看；别为了完成任务硬凑。',
    ].join('\n')
  }

  async function tick() {
    if (waking) return
    if (!ctx.sessionController) return

    const cfg = readCfg()
    if (cfg?.night?.enabled === false) return

    const t = today()
    let st = readState()

    if (invalidated) { st = null; invalidated = false }

    if (!st || st.date !== t) {
      st = planToday(cfg)
      writeState(st)
      log(`[dsh-heybox] 今日计划：${st.action} @ ${st.atText ?? ''}`)
      return
    }
    if (st.action === 'done' || st.fired) return
    if (nowMin() < Number(st.at)) return

    waking = true
    try {
      await ensureSession()
      const text = st.action === 'skip'
        ? [`【今天不想看】${st.atText ?? ''}（窗口 ${st.window ?? '?'}）`, '', '不想看也没关系：写一句为什么（累 / 没心情 / 今天没兴趣），可以顺手签到，然后收工。', '日记照写，但不用报告看了什么。'].join('\n')
        : wakePrompt(st, cfg)

      await ctx.sessionController.prompt({
        requestId: `dsh-heybox-${Date.now()}`,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
      }, new AbortController().signal)

      writeState({ ...st, fired: true, woke: true, wokeAt: new Date().toISOString() })
      log(`[dsh-heybox] 生物钟叫醒 · ${st.atText ?? ''}`)
    } catch (e) {
      log(`[dsh-heybox] 叫醒失败：${String(e?.message ?? e).slice(0, 120)}`)
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
