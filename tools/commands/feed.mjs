#!/usr/bin/env node
// 信息流：小黑盒首页动态。
// 用法：node heybox.mjs feed [--offset N] [--limit N] [--json]
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const json = argv.includes('--json')
const offset = Number(flag('--offset', 0))
const limit = Number(flag('--limit', 20))

const client = new HeyboxClient()

try {
  const data = await client.get('/bbs/app/feeds', { offset, limit, pull: '0', dw: '604' })
  const items = data.result?.links ?? []

  if (json) {
    console.log(JSON.stringify({ items, raw: data }, null, 2))
  } else {
    console.log(`\n信息流 · ${items.length} 条（offset=${offset}）\n`)
    for (const it of items) {
      const id = it.linkid ?? it.link_id ?? ''
      const title = String(it.title ?? it.description ?? '（无标题）').replace(/\s+/g, ' ').slice(0, 60)
      const user = it.user?.username ?? it.user?.nickname ?? ''
      const likes = it.link_award_num ?? it.up ?? 0
      const comments = it.comment_num ?? 0
      const topics = (it.topics ?? []).map((t) => `#${t.name}#`).join(' ')
      console.log(`• [${id}] ${title}`)
      console.log(`  ${user ? 'by ' + user + ' · ' : ''}赞 ${likes} · 评论 ${comments}${topics ? ` · ${topics}` : ''}`)
    }
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
