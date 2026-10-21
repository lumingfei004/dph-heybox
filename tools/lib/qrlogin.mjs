/**
 * 扫码登录：小黑盒 App 扫码，服务端通过 Set-Cookie 下发 pkey。
 *
 * 流程（start 接口已用真实请求验证）：
 *   GET /account/get_qrcode_url/?app=web   → { qr_url, expire }
 *   GET /account/qr_state/?app=web&qr=…    → { result: { error: wait | ready | ok } }
 *   成功后响应头 Set-Cookie 里带 pkey，配合 result 里的 heybox_id 写入凭据。
 */
import { HeyboxClient } from './http.mjs'
import { saveCookies } from './auth.mjs'

/** 把 Set-Cookie 头合并进 cookie 对象 */
export function mergeSetCookies(cookies, setCookies) {
  for (const raw of setCookies || []) {
    const first = String(raw).split(';')[0]
    const idx = first.indexOf('=')
    if (idx <= 0) continue
    const name = first.slice(0, idx).trim()
    const value = first.slice(idx + 1).trim()
    if (name) cookies[name] = value
  }
  return cookies
}

/** 第一步：拿二维码地址与 token */
export async function startQrLogin(client = new HeyboxClient({ cookies: {}, interval: 0 })) {
  const data = await client.get('/account/get_qrcode_url/', { app: 'web' })
  const qrUrl = data.result?.qr_url
  if (!qrUrl) throw new Error('接口没有返回二维码地址')
  const token = new URL(qrUrl).searchParams.get('qr') || ''
  if (!token) throw new Error('二维码地址里没有 qr token')
  return { qrUrl, token, expire: Number(data.result?.expire ?? 120) }
}

/**
 * 第二步：轮询扫码状态。
 * 传入已有的 client 可以保持临时会话；否则每次新建（qr token 本身足够）。
 */
export async function pollQrLogin(token, sessionCookies = {}, client) {
  const c = client || new HeyboxClient({ cookies: sessionCookies, interval: 0 })
  const { data, setCookies } = await c.request({
    path: '/account/qr_state/',
    params: { app: 'web', qr: token },
    captureCookies: true,
  })
  const cookies = mergeSetCookies({ ...sessionCookies }, setCookies)
  const result = data.result ?? {}
  const state = String(result.error ?? '')
  if (state === 'ok') {
    // pkey 不一定只在 Set-Cookie 里：服务器也可能把它放进响应体（result.pkey / result.user_pkey）。
    // 两种来源都收，少了任一处都会表现为「扫码成功但一直显示未登录」。
    if (result.pkey) cookies.pkey = String(result.pkey)
    if (result.user_pkey) cookies.user_pkey = String(result.user_pkey)

    const profile = result.profile ?? {}
    const detail = result.account_detail ?? {}
    const heyboxId = String(profile.heybox_id ?? detail.userid ?? result.heybox_id ?? '')
    const extra = heyboxId ? { heybox_id: heyboxId, user_heybox_id: heyboxId } : {}
    const merged = saveCookies({ ...cookies, ...extra })

    // 拿到 cookie 后立刻验证一次：没验证成功就告诉用户具体原因，而不是假装登录了
    let verified = false
    let verifyError = ''
    try {
      const check = new HeyboxClient({ cookies: merged, interval: 0 })
      const r = await check.get('/account/restore_login')
      const rr = r.result ?? {}
      const id = String(rr.profile?.heybox_id ?? rr.heybox_id ?? rr.account_detail?.userid ?? '')
      verified = Boolean(id)
      if (!verified) verifyError = 'restore_login 没返回账号'
    } catch (err) {
      verifyError = String(err?.message ?? err)
    }

    return { state: 'ok', heyboxId, cookies: merged, verified, verifyError, hasPkey: Boolean(merged.pkey || merged.user_pkey) }
  }
  return { state: state || 'unknown', cookies }
}
