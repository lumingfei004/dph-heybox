#!/usr/bin/env node
// 确认凭据属于哪个号：调用 restore_login，输出身份。
import { HeyboxClient } from '../lib/http.mjs'
import { heyboxId } from '../lib/auth.mjs'

const json = process.argv.includes('--json')
const client = new HeyboxClient()

try {
  const data = await client.get('/account/restore_login')
  const r = data.result ?? {}
  const profile = r.profile ?? {}
  const detail = r.account_detail ?? {}
  const id = String(profile.heybox_id ?? detail.userid ?? r.heybox_id ?? heyboxId() ?? '')
  const name = String(profile.username ?? profile.nickname ?? detail.nickname ?? '')

  if (json) {
    console.log(JSON.stringify({ heybox_id: id, name, loggedIn: Boolean(id) }, null, 2))
  } else if (id) {
    console.log(`✓ 已登录：${name || '（无昵称）'} · heybox_id=${id}`)
  } else {
    console.log('✗ 未登录或凭据失效：跑 heybox login 或检查 cookie')
    process.exitCode = 1
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
