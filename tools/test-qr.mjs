/**
 * 扫码登录链路测试（不真的扫码）：start → 生成二维码 → poll 一次。
 * 运行：node tools/test-qr.mjs
 */
import { startQrLogin, pollQrLogin } from './lib/qrlogin.mjs'

const { qrUrl, token, expire } = await startQrLogin()
console.log('✓ start：qrUrl =', qrUrl.slice(0, 70) + '…')
console.log('  token =', token, '· expire =', expire)

let qrcode = null
try { qrcode = (await import('qrcode')).default } catch { qrcode = null }
if (qrcode) {
  const dataUrl = await qrcode.toDataURL(qrUrl, { margin: 1, width: 240 })
  console.log('✓ qrcode：dataUrl 前缀 =', dataUrl.slice(0, 30), '长度 =', dataUrl.length)
} else {
  console.log('✗ qrcode 依赖未安装')
}

const out = await pollQrLogin(token)
console.log('✓ poll：state =', out.state)
