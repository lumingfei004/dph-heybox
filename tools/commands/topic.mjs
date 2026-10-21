#!/usr/bin/env node
// 话题搜索：node heybox.mjs topic <关键词> [--offset N] [--limit N] [--json]
//
// 原来的热门话题接口 /bbs/app/api/feed/hot 已 404，改用站内话题搜索。
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const json = argv.includes('--json')
const query = argv.find((a) => a && !a.startsWith('--') && a !== flag('--offset', '') && a !== flag('--limit', ''))
const offset = Number(flag('--offset', 0))
const limit = Number(flag('--limit', 20))

if (!query) {
  console.error('用法: node heybox.mjs topic <关键词> [--offset N] [--limit N] [--json]')
  process.exit(2)
}

const client = new HeyboxClient()

try {
  const data = await client.get('/bbs/app/api/search/topic', { q: query, offset, limit })
  if (json) { console.log(JSON.stringify(data, null, 2)); process.exit(0) }

  const topics = data.result?.topics ?? []
  console.log(`\n话题「${query}」· ${topics.length} 条\n`)
  for (const t of topics) {
    const name = t.name ?? ''
    const id = t.topic_id ?? ''
    const hot = t.show_desc ?? t.hot?.desc ?? ''
    console.log(`• [${id}] #${name}#${hot ? ` · ${hot}` : ''}`)
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
