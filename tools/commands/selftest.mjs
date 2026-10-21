#!/usr/bin/env node
/**
 * 启动自检：装完先跑这个。
 *
 * 离线部分（不需要网络）：
 *   - Node 版本
 *   - 配置文件
 *   - 凭据是否齐全（不回显）
 *   - 签名算法已知向量（hkey 必须等于 VTWXY78）
 *
 * 在线部分（--online）：
 *   - 用 restore_login 验证登录态与身份
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hkey, rndSignature } from '../lib/sign.mjs'
import { configPath, config } from '../lib/config.mjs'
import { CRED_FILE, COOKIE_TXT, hasLogin, heyboxId, loadCookies } from '../lib/auth.mjs'

const HOME = process.env.USERPROFILE || os.homedir()
const args = new Set(process.argv.slice(2))
const online = args.has('--online')

const rows = []
const push = (ok, name, detail) => rows.push({ ok, name, detail })

// 1. Node
const major = Number(process.versions.node.split('.')[0])
push(major >= 18, 'Node', `v${process.versions.node}${major >= 18 ? '' : '（需要 18+，fetch 不可用）'}`)

// 2. 配置
push(fs.existsSync(configPath), '配置文件', configPath)
const cfg = config()
push(true, '配置可读', `信息流 ${cfg.feed.limit} 条 · 点赞日上限 ${cfg.like.dailyLimit}`)

// 3. 凭据
const cookies = loadCookies()
const hasPkey = hasLogin(cookies)
const hid = heyboxId(cookies)
push(hasPkey, '登录凭据', hasPkey ? `pkey 已找到${hid ? ` · heybox_id=${hid}` : '（缺 heybox_id）'}` : '缺 pkey：先登录网页版，复制 Cookie 写入设置页')
push(fs.existsSync(CRED_FILE) || fs.existsSync(COOKIE_TXT), '凭据文件', fs.existsSync(CRED_FILE) ? CRED_FILE : (fs.existsSync(COOKIE_TXT) ? COOKIE_TXT : '（尚未写入）'))

// 4. 签名已知向量（离线，必须通过）
const SAMPLE = { path: '/account/restore_login', ts: 1792513378, nonce: '2CDF05DB59B726A5E67CE603BFC49208', expect: 'VTWXY78' }
const got = hkey(SAMPLE.path, SAMPLE.ts, SAMPLE.nonce)
push(got === SAMPLE.expect, '签名算法', got === SAMPLE.expect ? '已知向量通过 ✓' : `算得 ${got}，期望 ${SAMPLE.expect} ✗`)

// 5. _rnd 可用性（只检查能算出 15: 前缀）
const rnd = rndSignature('ABC', '1792513378:ABC')
push(rnd.startsWith('15:') && rnd.length === 3 + 64, '_rnd 签名', rnd.startsWith('15:') ? 'HMAC-SHA256 可用 ✓' : '异常 ✗')

// —— 输出 ——
console.log('\n小黑盒插件 · 启动自检')
console.log('='.repeat(46))
for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(10)} ${r.detail ?? ''}`)
console.log('='.repeat(46))

// —— 在线检查 ——
if (online) {
  if (!hasPkey) {
    console.log('\n跳过在线检查：没有 pkey。')
  } else {
    const { HeyboxClient } = await import('../lib/http.mjs')
    try {
      const client = new HeyboxClient()
      const data = await client.get('/account/restore_login')
      const r = data.result ?? {}
      const id = String(r.profile?.heybox_id ?? r.heybox_id ?? r.account_detail?.userid ?? '')
      const name = String(r.profile?.username ?? r.profile?.nickname ?? '')
      console.log(`\n✓ 在线登录态：${name || '（无昵称）'} · heybox_id=${id || hid}`)
    } catch (err) {
      console.log(`\n✗ 在线检查失败：${err.message}`)
    }
  }
}

const failed = rows.filter((r) => !r.ok)
console.log(failed.length ? `\n有 ${failed.length} 项未通过。` : '\n全部通过 ✓')
console.log('\n下一步：')
console.log('  ① 设置页扫码登录（不需要复制 Cookie）')
console.log('  ② 跑 node heybox.mjs feed 看信息流')
console.log('  ③ 想让它自己逛：设置页「作息」里开「随机醒」')
process.exit(failed.length ? 1 : 0)
