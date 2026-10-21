#!/usr/bin/env node
// 点赞 / 取消点赞：node heybox.mjs like <link_id> [--undo] [--go] [--path /bbs/app/profile/award/link]
//
// 点赞接口（2026-10-21 抓包确认）：POST /bbs/app/profile/award/link
// 签名样本 hkey=20T3315 已离线复算通过。
import { HeyboxClient } from '../lib/http.mjs'

const argv = process.argv.slice(2)
const go = argv.includes('--go')
const undo = argv.includes('--undo')
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const likePath = flag('--path', '/bbs/app/profile/award/link')
const linkId = argv.find((a) => a && !a.startsWith('--') && a !== flag('--path', ''))

if (!linkId) {
  console.error('用法: node heybox.mjs like <link_id> [--undo] [--go]')
  process.exit(2)
}

if (!go) {
  console.log('预演（不会真的点赞）：')
  console.log(`  POST ${likePath}`)
  console.log(`  body: { link_id: "${linkId}", award_type: "${undo ? '0' : '1'}" }`)
  console.log('\n加 --go 才会真的发出去。')
  process.exit(0)
}

const client = new HeyboxClient()

try {
  // 抓包确认：POST /bbs/app/profile/award/link + form { link_id, award_type: 1 }
  const body = { link_id: String(linkId), award_type: undo ? '0' : '1' }
  const data = await client.request({ path: likePath, method: 'POST', body, workshop: true })
  console.log(undo ? `✓ 已取消点赞（${linkId}）` : `✓ 已点赞（${linkId}）`)
  if (data?.result && typeof data.result === 'object') {
    const r = data.result
    if (r.link_like_count != null || r.like_num != null) console.log(`  当前赞数：${r.link_like_count ?? r.like_num}`)
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  if (err.code === 'api') {
    console.error('  提示：点赞接口是 ' + likePath + '（award_type=1 点赞 / 0 取消），可用 --path 覆盖。')
  }
  process.exitCode = 1
}
