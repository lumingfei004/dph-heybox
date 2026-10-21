/**
 * HTTP 客户端：统一参数 + 签名 + cookie + 串行限速 + 熔断。
 *
 * 约定（来自小黑盒前端的错误语义）：
 *   status = ok                        → 正常
 *   status = relogin / not_login / …   → 登录态失效，必须重新登录
 *   status = show_captcha / …          → 触发验证码，立即停手
 *   HTTP 429                           → 限流，停手
 *   写请求永不自动重试
 */
import { signParams } from './sign.mjs'
import { cookieHeader, loadCookies } from './auth.mjs'

export const API_BASE = 'https://api.xiaoheihe.cn'
export const WEB_BASE = 'https://www.xiaoheihe.cn'

// web 端通用参数（与真实请求一致）
export const BASE_PARAMS = {
  os_type: 'web',
  app: 'heybox',
  client_type: 'web',
  version: '999.0.4',
  web_version: '3.0',
  x_client_type: 'web',
  x_app: 'heybox_website',
  x_os_type: 'Windows',
  device_info: 'Chrome',
  device_id: '2c2fef8385ccef915e3b3caf94e3aa06',
}

const AUTH_STATUS = new Set(['relogin', 'not_login', 'need_login', 'login_required', 'need_google_check'])
const CAPTCHA_STATUS = new Set(['show_captcha', 'need_captcha'])

export class HeyboxError extends Error {
  constructor(message, code = 'api', extra = {}) {
    super(message)
    this.name = 'HeyboxError'
    this.code = code
    this.extra = extra
  }
}

export class HeyboxClient {
  /**
   * @param {object} opts
   * @param {object} [opts.cookies]   cookie 对象；缺省从凭据层读
   * @param {number} [opts.interval]  请求最小间隔（毫秒）
   * @param {number} [opts.timeout]   单请求超时（毫秒）
   */
  constructor({ cookies, interval = 700, timeout = 25000 } = {}) {
    this.cookies = cookies ?? loadCookies()
    this.interval = interval
    this.timeout = timeout
    this.lastAt = 0
    this.calls = 0
  }

  get loggedIn() {
    return Boolean(this.cookies.pkey || this.cookies.user_pkey)
  }

  async #throttle() {
    const wait = this.interval - (Date.now() - this.lastAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastAt = Date.now()
    this.calls += 1
  }

  /**
   * 发一个请求。
   * @param {object} req
   * @param {string} req.path            例如 /bbs/app/feeds
   * @param {object} [req.params]        业务参数
   * @param {string} [req.method]        GET（默认）或 POST
   * @param {object} [req.body]          POST 时的 JSON 体
   * @param {boolean} [req.workshop]     写接口是否附加 _rnd
   * @param {boolean} [req.signed]       是否加 hkey/_time/nonce（默认 true）
   */
  async request({ path, params = {}, method = 'GET', body, workshop = false, signed = true, captureCookies = false } = {}) {
    if (!path || !path.startsWith('/')) throw new HeyboxError('path 必须以 / 开头', 'input')
    if (method !== 'GET' && this.cookies && this.loggedIn === false) {
      throw new HeyboxError('写操作需要登录：先运行 heybox login 或粘贴 cookie', 'auth')
    }

    const query = { ...BASE_PARAMS, ...params }
    if (signed) Object.assign(query, signParams(path, { workshop }))

    const url = new URL(API_BASE + path)
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }

    const headers = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      accept: 'application/json, text/plain, */*',
      referer: WEB_BASE + '/',
      origin: WEB_BASE,
    }
    const cookie = cookieHeader(this.cookies)
    if (cookie) headers.cookie = cookie

    // 小黑盒写接口用表单编码（application/x-www-form-urlencoded），不是 JSON
    let payload
    if (body !== undefined) {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
      const form = new URLSearchParams()
      for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) form.set(k, String(v))
      payload = form.toString()
    }

    await this.#throttle()

    let res
    try {
      res = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(this.timeout),
      })
    } catch (err) {
      throw new HeyboxError(`网络请求失败：${err?.message ?? err}`, 'network')
    }

    if (res.status === 401 || res.status === 403) {
      throw new HeyboxError('小黑盒返回 401/403：登录态可能失效', 'auth')
    }
    if (res.status === 429) {
      throw new HeyboxError('小黑盒限流（429）：已停止', 'rate_limit')
    }

    let data
    try {
      data = await res.json()
    } catch {
      throw new HeyboxError(`响应不是 JSON（HTTP ${res.status}）`, 'protocol')
    }

    // 扫码登录要靠 Set-Cookie 拿 pkey，这里把响应头里的 cookie 一并带出去
    const setCookies = typeof res.headers?.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    const wrap = (value) => (captureCookies ? { data: value, setCookies } : value)

    if (!res.ok) {
      throw new HeyboxError(`HTTP ${res.status}：${data?.msg ?? data?.message ?? '未知错误'}`, 'http', { status: res.status })
    }

    const status = data?.status
    if (status === 'ok') return wrap(data)
    if (AUTH_STATUS.has(status)) {
      throw new HeyboxError(`登录态失效（${status}）：请重新登录`, 'auth')
    }
    if (CAPTCHA_STATUS.has(status)) {
      throw new HeyboxError(`小黑盒要求验证码（${status}）：请到网页完成验证后重试`, 'captcha')
    }
    throw new HeyboxError(`小黑盒拒绝（${status ?? 'no-status'}）：${data?.msg ?? ''}`.trim(), 'api', { payload: data })
  }

  get(path, params) { return this.request({ path, params }) }
}
