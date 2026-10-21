#!/usr/bin/env node
// 发帖（纯文字）：node heybox.mjs post --title "标题" --text "正文" [--draft] [--go] [--tag N]
//
// 接口：POST /bbs/app/api/link/post
// 表单：title / text（JSON 块数组）/ post_type / link_tag / draft / view_limit / original / words_count
// 图片帖和长文排版属于 P2 后续，这里先支持文字。
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const go = argv.includes('--go')
const draft = argv.includes('--draft')
const flags = {}
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a === '--go' || a === '--draft') continue
  if (a.startsWith('--')) { flags[a] = argv[i + 1] ?? ''; i += 1; continue }
}

const title = String(flags['--title'] ?? '').trim()
const text = String(flags['--text'] ?? '').trim()
const tag = String(flags['--tag'] ?? '11')

if (!title || !text) {
  console.error('用法: node heybox.mjs post --title "标题" --text "正文" [--draft] [--go]')
  process.exit(2)
}

const blocks = [{ type: 'text', text }]
const form = {
  title,
  text: JSON.stringify(blocks),
  post_type: '1',
  link_tag: tag,
  draft: draft ? '1' : '0',
  view_limit: '1',
  original: '1',
  words_count: String(text.length),
}

if (!go) {
  console.log('预演（不会真的发）：')
  console.log('  POST /bbs/app/api/link/post')
  console.log('  form:', JSON.stringify({ ...form, text: '（JSON 块，已省略）' }))
  console.log(draft ? '\n加 --go 会存成草稿。' : '\n加 --go 会直接发布。')
  process.exit(0)
}

const client = new HeyboxClient()

try {
  const data = await client.request({ path: '/bbs/app/api/link/post', method: 'POST', body: form, workshop: true })
  const linkId = data.link_id ?? data.result?.link_id ?? ''
  console.log(`✓ ${draft ? '已存草稿' : '已发布'}${linkId ? ` · link_id=${linkId}` : ''}`)
  if (linkId) console.log(`  https://www.xiaoheihe.cn/app/bbs/link/${linkId}`)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
