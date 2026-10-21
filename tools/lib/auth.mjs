/**
 * 凭据层：只读/只写 cookie，永远不回显。
 *
 * 查找顺序：
 *   1. 环境变量 HEYBOX_COOKIE（"pkey=…; heybox_id=…"）
 *   2. ~/.heybox-ai/credentials.json 的 cookies 字段
 *   3. ~/.heybox-ai/cookie.txt（用户手动粘贴的整串 Cookie）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.USERPROFILE || os.homedir()

export const CRED_DIR = path.join(HOME, '.heybox-ai')
export const CRED_FILE = path.join(CRED_DIR, 'credentials.json')
export const COOKIE_TXT = path.join(CRED_DIR, 'cookie.txt')

/** 把 "a=b; c=d" 或对象解析成纯对象 */
export function parseCookieString(raw) {
  const out = {}
  if (!raw) return out
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (k && v != null) out[String(k).trim()] = String(v).trim()
    return out
  }
  for (const pair of String(raw).split(';')) {
    const idx = pair.indexOf('=')
    if (idx <= 0) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    if (name) out[name] = value
  }
  return out
}

/** 读登录 cookie（合并所有来源，后者不覆盖前者的同名键） */
export function loadCookies() {
  let cookies = {}

  const fromEnv = parseCookieString(process.env.HEYBOX_COOKIE)
  cookies = { ...fromEnv, ...cookies }

  try {
    const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'))
    cookies = { ...parseCookieString(cred.cookies), ...cookies }
  } catch { /* 没有凭据文件 */ }

  try {
    const txt = fs.readFileSync(COOKIE_TXT, 'utf8').trim()
    const parsed = parseCookieString(txt)
    for (const [k, v] of Object.entries(parsed)) if (!(k in cookies)) cookies[k] = v
  } catch { /* 没有 cookie.txt */ }

  return cookies
}

/** 写入凭据（保留旧的无关 cookie，合并更新） */
export function saveCookies(input) {
  const incoming = parseCookieString(input)
  const current = loadCookies()
  const merged = { ...current, ...incoming }
  // 兼容 user_pkey / user_heybox_id 别名
  if (merged.user_pkey && !merged.pkey) merged.pkey = merged.user_pkey
  if (merged.pkey && !merged.user_pkey) merged.user_pkey = merged.pkey
  if (merged.user_heybox_id && !merged.heybox_id) merged.heybox_id = merged.user_heybox_id
  if (merged.heybox_id && !merged.user_heybox_id) merged.user_heybox_id = merged.heybox_id

  fs.mkdirSync(CRED_DIR, { recursive: true })
  fs.writeFileSync(CRED_FILE, JSON.stringify({ cookies: merged, savedAt: new Date().toISOString() }, null, 2) + '\n')
  try { fs.chmodSync(CRED_FILE, 0o600) } catch { /* Windows 上不生效，忽略 */ }
  return merged
}

export function cookieHeader(cookies = loadCookies()) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

export function hasLogin(cookies = loadCookies()) {
  return Boolean(cookies.pkey || cookies.user_pkey)
}

export function heyboxId(cookies = loadCookies()) {
  return String(cookies.heybox_id || cookies.user_heybox_id || '')
}
