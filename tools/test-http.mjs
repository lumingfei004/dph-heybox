/**
 * 离线测试：mock 掉 fetch，检查请求构造是否正确。
 * 运行：node tools/test-http.mjs
 */
import { HeyboxClient } from './lib/http.mjs'

const calls = []
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts })
  return {
    status: 200,
    ok: true,
    json: async () => ({ status: 'ok', result: { touched: true } }),
  }
}

const client = new HeyboxClient({ cookies: { pkey: 'TEST_PKEY', heybox_id: '51509723' }, interval: 0 })

await client.get('/bbs/app/feeds', { offset: 0, limit: 5 })
await client.request({ path: '/bbs/app/comment/create', method: 'POST', body: { link_id: '1', text: 'hi' }, workshop: true })

let failed = 0
const check = (ok, name, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

const [getCall, postCall] = calls
const g = new URL(getCall.url)
const gq = Object.fromEntries(g.searchParams)
check(g.pathname === '/bbs/app/feeds', 'GET path', g.pathname)
check(/^[A-Z0-9]{5,7}$/.test(gq.hkey ?? ''), 'GET hkey', gq.hkey)
check(/^\d{10}$/.test(gq._time ?? ''), 'GET _time', gq._time)
check(/^[A-F0-9]{32}$/.test(gq.nonce ?? ''), 'GET nonce', (gq.nonce ?? '').slice(0, 8) + '…')
check(gq.device_id === '2c2fef8385ccef915e3b3caf94e3aa06', 'GET device_id')
check(gq.version === '999.0.4', 'GET version', gq.version)
check(!gq._rnd, 'GET 不带 _rnd')
check(getCall.opts.headers.cookie === 'pkey=TEST_PKEY; heybox_id=51509723', 'GET cookie 头')

const p = new URL(postCall.url)
const pq = Object.fromEntries(p.searchParams)
check(p.pathname === '/bbs/app/comment/create', 'POST path', p.pathname)
check(pq.hkey && pq.hkey.length === 7, 'POST hkey', pq.hkey)
check((pq._rnd ?? '').startsWith('15:'), 'POST _rnd', (pq._rnd ?? '').slice(0, 12) + '…')
check(postCall.opts.headers['content-type']?.includes('x-www-form-urlencoded') === true, 'POST content-type')
check(postCall.opts.body === 'link_id=1&text=hi', 'POST form body', postCall.opts.body)
check(postCall.opts.method === 'POST', 'POST method')

console.log(failed ? `\n${failed} 项失败` : '\n全部通过 ✓')
process.exit(failed ? 1 : 0)
