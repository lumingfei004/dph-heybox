/**
 * 端到端读接口实测（免登录）。运行：node tools/test-live.mjs
 */
import { HeyboxClient } from './lib/http.mjs'

const client = new HeyboxClient({ cookies: {}, interval: 900 })
const tests = [
  ['feeds', () => client.get('/bbs/app/feeds', { offset: 0, limit: 3, pull: '0', dw: '604' })],
  ['link-tree', () => client.get('/bbs/app/link/tree', { link_id: '194502685', page: 1, is_first: 1, index: 1, owner_only: 0, offset: 0, limit: 5, sort_filter: 'hot' })],
  ['hot-topics', () => client.get('/bbs/app/api/feed/hot', { offset: 0, limit: 5 })],
  ['game-list', () => client.get('/bbs/app/api/game/get_game_list', { offset: 0, limit: 5 })],
  ['search', () => client.get('/bbs/app/api/general/search/v1', { q: '艾尔登法环', search_type: 'link', offset: 0, limit: 3 })],
]

for (const [name, fn] of tests) {
  try {
    const d = await fn()
    const r = d.result ?? {}
    console.log(`\n✓ ${name}  status=${d.status}`)
    console.log('  result keys:', Object.keys(r).slice(0, 8).join(', '))
    console.log('  sample:', JSON.stringify(r).slice(0, 260))
  } catch (e) {
    console.log(`\n✗ ${name}  [${e.code}] ${e.message}`)
  }
}
