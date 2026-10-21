#!/usr/bin/env node
// 帖子详情：node heybox.mjs link <link_id> [--json]
// 小黑盒的帖子正文和评论在同一接口 /bbs/app/link/tree。
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const json = argv.includes('--json')
const linkId = argv.find((a) => a && !a.startsWith('--'))

if (!linkId) {
  console.error('用法: node heybox.mjs link <link_id> [--json]')
  process.exit(2)
}

const client = new HeyboxClient()
const str = (v) => (v == null ? '' : String(v))

// 把 blocks 里的文本抽出来（小黑盒正文是 JSON 块数组）
function textOf(value) {
  if (typeof value === 'string') {
    try {
      const blocks = JSON.parse(value)
      if (Array.isArray(blocks)) return blocks.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n')
    } catch { /* 不是 JSON，原样返回 */ }
    return value
  }
  return ''
}

try {
  const data = await client.get('/bbs/app/link/tree', {
    link_id: linkId, page: 1, is_first: 1, index: 1, owner_only: 0, offset: 0, limit: 20, sort_filter: 'hot',
  })
  const result = data.result ?? {}
  const link = result.link ?? result

  if (json) {
    console.log(JSON.stringify({ link, raw: data }, null, 2))
  } else {
    const user = link.user ?? {}
    console.log(`\n${str(link.title) || '（无标题）'}`)
    console.log('─'.repeat(50))
    console.log(`作者：${str(user.username ?? user.nickname) || '未知'} · 赞 ${str(link.link_like_count ?? link.like_num ?? 0)} · 评论 ${str(link.comment_num ?? link.comment_count ?? 0)}`)
    console.log(`链接：https://www.xiaoheihe.cn/app/bbs/link/${linkId}\n`)
    console.log(textOf(link.text) || str(link.description) || '（无正文）')
    const topics = link.topics ?? []
    if (Array.isArray(topics) && topics.length) {
      console.log('\n话题：' + topics.map((t) => '#' + (t.name ?? '') + '#').join(' '))
    }
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
