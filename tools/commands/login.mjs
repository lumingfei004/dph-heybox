#!/usr/bin/env node
// 登录：
//   node heybox.mjs login --qr       扫码登录（推荐，不需要抓包）
//   node heybox.mjs login "pkey=…"   手动粘贴（兜底）
//   node heybox.mjs login            交互粘贴
import { saveCookies, heyboxId } from '../lib/auth.mjs'
import { startQrLogin, pollQrLogin } from '../lib/qrlogin.mjs'

const argv = process.argv.slice(2)

async function qrLogin() {
  let qrcode = null
  try { qrcode = (await import('qrcode')).default } catch { qrcode = null }
  if (!qrcode) {
    console.error('✗ 缺少 qrcode 依赖：在插件目录运行 pnpm add qrcode')
    process.exit(1)
  }

  const { qrUrl, token, expire } = await startQrLogin()
  console.log('\n用小黑盒 App 扫码登录（' + expire + ' 秒内有效）：\n')
  console.log(await qrcode.toString(qrUrl, { type: 'terminal', small: true }))
  console.log('二维码内容：' + qrUrl + '\n')

  const deadline = Date.now() + Math.min(expire, 120) * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const out = await pollQrLogin(token)
      if (out.state === 'ok') {
        console.log(`✓ 登录成功 · heybox_id=${out.heyboxId || '（未返回）'}`)
        return
      }
      if (out.state === 'ready') console.log('… 已扫码，请在 App 里确认')
    } catch (err) {
      console.error('轮询失败：' + err.message)
      break
    }
  }
  console.error('✗ 二维码已过期，请重新运行')
  process.exit(1)
}

async function manualLogin(raw) {
  if (!raw) {
    raw = await new Promise((resolve) => {
      console.error('粘贴整串 Cookie，然后按 Ctrl+Z 回车（Windows）：')
      let input = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (c) => { input += c })
      process.stdin.on('end', () => resolve(input.trim()))
    })
  }
  if (!raw) { console.error('没有读到内容'); process.exit(1) }
  const cookies = saveCookies(raw)
  if (!cookies.pkey && !cookies.user_pkey) {
    console.error('✗ 没找到 pkey：请复制完整 Cookie（应包含 pkey 和 heybox_id）')
    process.exit(1)
  }
  console.log(`✓ 已写入 ~/.heybox-ai/credentials.json · heybox_id=${heyboxId(cookies) || '（缺）'}`)
}

if (argv.includes('--qr')) {
  await qrLogin()
} else {
  await manualLogin(argv.join(' ').trim())
}
