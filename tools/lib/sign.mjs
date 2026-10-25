/**
 * 小黑盒 web 端请求签名 —— 已用真实请求验证（2026-10-21）
 *
 * 验证样本：
 *   path=/account/restore_login
 *   _time=1792513378
 *   nonce=2CDF05DB59B726A5E67CE603BFC49208
 *   → hkey=VTWXY78 ✅
 *
 * 为什么公开实现算不对：
 *   xhhBackCrack / xiaoheihe-cli 都只把 MD5 尾部 6 字节里的 **前 4 个** 拿去算校验和。
 *   真实前端（index-B0hvTGhe.js 的 Tr 函数）是：
 *     前 4 个做位混合 → 后 2 个原样保留 → 6 个**一起**求和 % 100
 *
 * 写接口（点赞 / 发帖 / 评论）还要一个 _rnd，用 HMAC-SHA256，盐值来自前端源码。
 */
import crypto from 'node:crypto'

export const ALPHABET = 'AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89'
export const HMAC_SALT = 'Z7mFG4tQp9Ws2LxB8H'

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')

// GF(2^8) 风格的双倍运算：与前端 w3 函数等价
const double = (v) => ((v << 1) ^ (v & 128 ? 27 : 0)) & 255
const three = (v) => double(v) ^ v
const nine = (v) => three(double(v))
const eleven = (v) => nine(three(double(v)))
const thirteen = (v) => eleven(v) ^ nine(v) ^ three(v)

// 4x4 混合：与前端 Vwe 函数的前半段等价
function mix4(a, b, c, d) {
  return [
    thirteen(a) ^ eleven(b) ^ nine(c) ^ three(d),
    three(a) ^ thirteen(b) ^ eleven(c) ^ nine(d),
    nine(a) ^ three(b) ^ thirteen(c) ^ eleven(d),
    eleven(a) ^ nine(b) ^ three(c) ^ thirteen(d),
  ]
}

const mapChars = (value, alphabet) => {
  let out = ''
  for (const ch of value) out += alphabet[ch.charCodeAt(0) % alphabet.length]
  return out
}

/** 按路径 + 时间戳 + nonce 计算 hkey（7 字符：5 位前缀 + 2 位校验和） */
export function hkey(path, timestamp, nonce) {
  const norm = '/' + String(path).split('/').filter(Boolean).join('/') + '/'
  const comps = [
    mapChars(String(timestamp), ALPHABET.slice(0, -2)),
    mapChars(norm, ALPHABET),
    mapChars(nonce, ALPHABET),
  ]

  const max = Math.max(...comps.map((c) => c.length))
  let interleaved = ''
  for (let k = 0; k < max; k += 1) {
    for (const c of comps) if (k < c.length) interleaved += c[k]
  }

  const digest = md5(interleaved.slice(0, 20))
  // ⚠️ 这里是关键：取尾部 6 个字节，全部参与校验和
  const tail = [...digest.slice(-6)].map((c) => c.charCodeAt(0))
  const mixed = [...mix4(tail[0], tail[1], tail[2], tail[3]), tail[4], tail[5]]
  const checksum = String(mixed.reduce((a, b) => a + b, 0) % 100).padStart(2, '0')
  const prefix = mapChars(digest.slice(0, 5), ALPHABET.slice(0, -4))
  return prefix + checksum
}

/** 生成 nonce：32 位大写 hex，与前端 md5(...) 的形式一致 */
export function makeNonce(timestamp = Math.floor(Date.now() / 1000)) {
  return md5(`${timestamp}${Date.now()}${Math.random()}`).toUpperCase()
}

/** 写接口附加签名：_rnd = "15:" + HMAC-SHA256(salt, salt + nonce + _time + ":" + nonce) */
export function rndSignature(nonce, time) {
  const message = `${HMAC_SALT}${nonce}${time}:${nonce}`
  return '15:' + crypto.createHmac('sha256', HMAC_SALT).update(message).digest('hex')
}

/** 一次性生成三个签名参数：hkey / _time / nonce（可选带 _rnd） */
export function signParams(path, { timestamp, nonce, workshop = false } = {}) {
  const t = timestamp ?? Math.floor(Date.now() / 1000)
  const n = nonce ?? makeNonce(t)
  const out = { hkey: hkey(path, t, n), _time: t, nonce: n }
  // 注意：rndSignature 内部自己会拼 `${time}:${nonce}`，这里只传纯时间戳
  if (workshop) out._rnd = rndSignature(n, t)
  return out
}
