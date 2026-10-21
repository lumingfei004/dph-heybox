#!/usr/bin/env node
// 通知：node heybox.mjs notify [--type 0|1|2|3] [--json]
// type：0=全部 1=评论 2=点赞 3=关注
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const json = argv.includes('--json')
const type = String(flag('--type', '0'))

const client = new HeyboxClient()

try {
  const data = await client.get('/account/get_user_notice', { notice_type: type })
  if (json) { console.log(JSON.stringify(data, null, 2)); process.exit(0) }

  const list = data.result?.notices ?? data.result?.notice_list ?? data.result?.list ?? []
  console.log(`\n通知 · ${list.length} 条（type=${type}）\n`)
  for (const n of list) {
    const user = (n.user ?? {}).username ?? (n.user ?? {}).nickname ?? ''
    const text = n.comment_text ?? n.text ?? n.title ?? ''
    console.log(`• ${user || '系统'}${text ? `：${String(text).slice(0, 80)}` : ''}`)
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
