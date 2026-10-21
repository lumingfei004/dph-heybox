#!/usr/bin/env node
// 搜索帖子：node heybox.mjs search <关键词> [--offset N] [--limit N] [--json]
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const json = argv.includes('--json')
const query = argv.find((a) => a && !a.startsWith('--') && a !== flag('--offset', '') && a !== flag('--limit', ''))
const offset = Number(flag('--offset', 0))
const limit = Math.max(3, Number(flag('--limit', 20)) || 20)   // 接口对 limit<3 返回空

if (!query) {
  console.error('用法: node heybox.mjs search <关键词> [--json]')
  process.exit(2)
}

const client = new HeyboxClient()

try {
  const data = await client.get('/bbs/app/api/general/search/v1', { q: query, search_type: 'link', offset, limit })
  if (json) { console.log(JSON.stringify(data, null, 2)); process.exit(0) }

  const items = data.result?.items ?? []
  const rows = items.filter((it) => (it.info ?? it).linkid ?? (it.info ?? it).link_id)
  console.log(`\n搜索「${query}」· ${rows.length} 条\n`)
  for (const it of rows) {
    const info = it.info ?? it
    const id = info.linkid ?? info.link_id ?? ''
    const title = String(info.title ?? info.description ?? '').replace(/\s+/g, ' ').slice(0, 60)
    const user = info.user?.username ?? info.user?.nickname ?? ''
    const likes = info.link_award_num ?? info.up ?? 0
    console.log(`• [${id}] ${title}${user ? ` · by ${user}` : ''}${likes ? ` · 赞 ${likes}` : ''}`)
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
