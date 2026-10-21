/**
 * 路径探测：找出话题 / 游戏库的可用接口，并打印 feeds 一条完整结构。
 * 运行：node tools/test-probe.mjs
 */
import { HeyboxClient } from './lib/http.mjs'

const client = new HeyboxClient({ cookies: {}, interval: 900 })

// 1) feeds 一条完整结构，确定字段名
try {
  const d = await client.get('/bbs/app/feeds', { offset: 0, limit: 1, pull: '0', dw: '604' })
  const item = d.result?.links?.[0]
  console.log('=== feeds item keys ===')
  console.log(Object.keys(item ?? {}).join(', '))
  console.log(JSON.stringify(item).slice(0, 1200))
} catch (e) { console.log('feeds ERR', e.message) }

// 2) 候选路径探测
const candidates = [
  ['game-search', '/game/search/', { q: '艾尔登法环', offset: 0, limit: 3 }],
  ['topic-search', '/bbs/app/api/search/topic', { q: '游戏', offset: 0, limit: 3 }],
  ['topic-list', '/bbs/app/api/topic/list', { offset: 0, limit: 3 }],
  ['topic-hot', '/bbs/app/api/topic/hot', { offset: 0, limit: 3 }],
  ['game-list2', '/bbs/app/api/game/list', { offset: 0, limit: 3 }],
  ['game-recommend', '/game/all_recommend/v2', { offset: 0, limit: 3 }],
  ['account-games', '/account/game_list/', { offset: 0, limit: 3, userid: '51509723' }],
  ['emojis', '/bbs/app/api/emojis/list', {}],
]

for (const [name, path, params] of candidates) {
  try {
    const d = await client.get(path, params)
    const r = d.result ?? {}
    console.log(`\n✓ ${name}  status=${d.status}  resultKeys=${Object.keys(r).slice(0, 8).join(',')}`)
    console.log('  ', JSON.stringify(r).slice(0, 300))
  } catch (e) {
    console.log(`\n✗ ${name}  [${e.code}] ${e.message}`)
  }
}
