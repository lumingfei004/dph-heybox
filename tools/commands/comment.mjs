#!/usr/bin/env node
// 评论列表：node heybox.mjs comment <link_id> [--offset N] [--limit N] [--json]
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const json = argv.includes('--json')
const linkId = argv.find((a) => a && !a.startsWith('--') && a !== flag('--offset', '') && a !== flag('--limit', ''))
const offset = Number(flag('--offset', 0))
const limit = Number(flag('--limit', 20))

if (!linkId) {
  console.error('用法: node heybox.mjs comment <link_id> [--offset N] [--limit N] [--json]')
  process.exit(2)
}

const client = new HeyboxClient()

// 递归找评论数组（不同版本字段名不同）
function findComments(value, depth = 0) {
  if (!value || depth > 4) return null
  if (Array.isArray(value)) {
    if (value.length && value.every((v) => v && typeof v === 'object' && ('commentid' in v || 'comment_id' in v))) return value
    for (const v of value) { const r = findComments(v, depth + 1); if (r) return r }
    return null
  }
  if (typeof value === 'object') {
    for (const k of ['comments', 'comment_list', 'list', 'data']) {
      if (value[k]) { const r = findComments(value[k], depth + 1); if (r) return r }
    }
    for (const v of Object.values(value)) { const r = findComments(v, depth + 1); if (r) return r }
  }
  return null
}

try {
  const data = await client.get('/bbs/app/link/tree', {
    link_id: linkId, page: offset / limit + 1, is_first: offset === 0 ? 1 : 0, index: 1,
    owner_only: 0, offset, limit, sort_filter: 'hot',
  })
  const comments = findComments(data.result) ?? []

  if (json) {
    console.log(JSON.stringify({ comments, raw: data }, null, 2))
  } else {
    console.log(`\n评论 · ${comments.length} 条\n`)
    for (const c of comments) {
      const id = c.commentid ?? c.comment_id ?? ''
      const text = c.text ?? c.content ?? ''
      const user = (c.user ?? {}).username ?? (c.user ?? {}).nickname ?? ''
      const likes = c.up ?? c.like_num ?? c.comment_like_count ?? 0
      console.log(`• [${id}] ${user || '匿名'}${likes ? ` · 赞 ${likes}` : ''}`)
      console.log(`  ${String(text).slice(0, 120)}`)
    }
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
