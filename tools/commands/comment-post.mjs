#!/usr/bin/env node
// 发评论：node heybox.mjs comment-post <link_id> --text "内容" [--reply-id X --root-id Y] [--go]
//
// 接口：POST /bbs/app/comment/create
// 表单：link_id / text / root_id / reply_id / is_cy，附带 _rnd 签名。
// 回复楼中楼时同时给 --root-id 和 --reply-id；普通评论两个都留 -1。
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const go = argv.includes('--go')
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a === '--go') continue
  if (a.startsWith('--')) { flags[a] = argv[i + 1] ?? ''; i += 1; continue }
  positional.push(a)
}

const linkId = positional[0]
const text = String(flags['--text'] ?? '').trim()
const rootId = String(flags['--root-id'] ?? '-1')
const replyId = String(flags['--reply-id'] ?? '-1')

if (!linkId || !text) {
  console.error('用法: node heybox.mjs comment-post <link_id> --text "内容" [--reply-id X --root-id Y] [--go]')
  process.exit(2)
}
if ((rootId === '-1') !== (replyId === '-1')) {
  console.error('回复楼中楼需要同时给 --root-id 和 --reply-id')
  process.exit(2)
}

const form = { link_id: linkId, text, root_id: rootId, reply_id: replyId, is_cy: '0' }

if (!go) {
  console.log('预演（不会真的发）：')
  console.log('  POST /bbs/app/comment/create')
  console.log('  form:', JSON.stringify(form))
  console.log('\n加 --go 才会真的发出去。')
  process.exit(0)
}

const client = new HeyboxClient()

try {
  const data = await client.request({ path: '/bbs/app/comment/create', method: 'POST', body: form, workshop: true })
  const cid = data.commentid ?? data.result?.commentid ?? ''
  console.log(`✓ 评论已发出${cid ? ` · commentid=${cid}` : ''}`)
  console.log(`  帖子：https://www.xiaoheihe.cn/app/bbs/link/${linkId}`)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
