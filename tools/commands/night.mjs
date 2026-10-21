#!/usr/bin/env node
// 自主逛一圈（生物钟到点时由宿主调用，不依赖 agent 会话）：
//   拉信息流 → 按兴趣挑帖 → 点赞（有上限）→ 写日记 → 输出摘要
//
// 用法：node heybox.mjs night [--skip] [--json]
//   --skip  今天"不想看"：只写一句原因，不点赞
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { config } from '../lib/config.mjs'
import { HeyboxClient } from '../lib/http.mjs'

const HOME = process.env.USERPROFILE || os.homedir()
const DSH_HOME = process.env.DSH_HOME || path.join(HOME, '.dsh')
const DIARY = path.join(DSH_HOME, 'heybox-diary.md')
const RUN_LOG = path.join(DSH_HOME, 'heybox-night-run.jsonl')

const argv = process.argv.slice(2)
const skip = argv.includes('--skip')
const json = argv.includes('--json')
const cfg = config()
const client = new HeyboxClient({ interval: 900 })

function appendRun(entry) {
  try {
    fs.mkdirSync(path.dirname(RUN_LOG), { recursive: true })
    fs.appendFileSync(RUN_LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
  } catch { /* 忽略 */ }
}

function appendDiary(lines) {
  try {
    fs.mkdirSync(path.dirname(DIARY), { recursive: true })
    fs.appendFileSync(DIARY, lines.join('\n') + '\n')
  } catch { /* 忽略 */ }
}

const skipReasons = [
  '今天有点累，不想刷了。',
  '没什么心情，看一眼就收工。',
  '今天不太想说话，就记一笔。',
  '懒得刷，明天再说。',
]

try {
  const now = new Date()
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ')

  if (skip) {
    const reason = skipReasons[Math.floor(Math.random() * skipReasons.length)]
    appendDiary([`## ${stamp}`, '', `（今天不想看：${reason}）`, ''])
    const out = { ok: true, skipped: true, reason, at: now.toISOString() }
    appendRun({ kind: 'skip', reason })
    console.log(json ? JSON.stringify(out) : `今天不想看：${reason}`)
    process.exit(0)
  }

  // 1. 拉信息流
  const feed = await client.get('/bbs/app/feeds', { offset: 0, limit: 10, pull: '0', dw: '604' })
  const items = feed.result?.links ?? []
  if (!items.length) {
    const out = { ok: false, error: '信息流为空' }
    appendRun({ kind: 'empty' })
    console.log(json ? JSON.stringify(out) : '信息流为空，今天没逛成。')
    process.exit(1)
  }

  // 2. 按兴趣挑帖
  const games = (cfg.interests?.games ?? []).filter(Boolean)
  const scored = items.map((it) => {
    const text = `${it.title ?? ''} ${it.description ?? ''} ${(it.topics ?? []).map((t) => t.name).join(' ')}`
    let score = 0
    for (const g of games) if (text.includes(g)) score += 3
    score += Math.min(3, Math.log10((it.link_award_num ?? 0) + 1))
    return { it, score }
  }).sort((a, b) => b.score - a.score)

  const maxItems = Math.max(1, Math.min(5, Number(cfg.night?.maxItems ?? 3)))
  const picked = scored.slice(0, maxItems)

  // 3. 点赞（每次醒来最多 1 条）
  const liked = []
  if (Number(cfg.like?.dailyLimit ?? 20) > 0) {
    const best = picked[0]?.it
    const id = best?.linkid ?? best?.link_id
    if (id) {
      try {
        await client.request({
          path: '/bbs/app/profile/award/link',
          method: 'POST',
          body: { link_id: String(id), award_type: '1' },
          workshop: true,
        })
        liked.push(String(id))
      } catch { /* 点赞失败不影响日记 */ }
    }
  }

  // 4. 写日记（第一人称、具体）
  const lines = [
    `## ${stamp}`,
    '',
    `今天刷了 ${items.length} 条动态，停下来看了 ${picked.length} 条：`,
    ...picked.map(({ it }) => {
      const title = String(it.title ?? it.description ?? '（无标题）').replace(/\s+/g, ' ').slice(0, 60)
      const likes = it.link_award_num ?? 0
      const topic = (it.topics ?? [])[0]?.name
      return `- ${title}${topic ? `（#${topic}#` : ''}${topic ? '）' : ''}${likes ? `，${likes} 赞` : ''}`
    }),
    liked.length ? '\n给最顺眼的那条点了个赞。' : '',
    '',
  ].filter(Boolean)
  appendDiary(lines)

  const out = {
    ok: true,
    items: items.length,
    picked: picked.map(({ it }) => ({ id: String(it.linkid ?? it.link_id ?? ''), title: String(it.title ?? '').slice(0, 60) })),
    liked,
    at: now.toISOString(),
  }
  appendRun({ kind: 'browse', picked: out.picked.length, liked: liked.length })

  if (json) {
    console.log(JSON.stringify(out))
  } else {
    console.log(`逛完了：${items.length} 条里挑了 ${picked.length} 条${liked.length ? '，点了 1 个赞' : ''}。`)
    for (const p of out.picked) console.log(`- [${p.id}] ${p.title}`)
  }
} catch (err) {
  appendRun({ kind: 'error', error: String(err?.message ?? err) })
  console.error(`逛黑盒失败：${err?.message ?? err}`)
  process.exit(1)
}
