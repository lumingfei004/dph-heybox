#!/usr/bin/env node
// 游戏库：node heybox.mjs game [--q 关键词] [--offset N] [--limit N] [--json]
// 不带 --q 查"我的游戏库"（/account/game_list/）；带 --q 走站内游戏搜索（/game/search/）。
import { HeyboxClient } from '../lib/http.mjs'
import { heyboxId } from '../lib/auth.mjs'

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const json = argv.includes('--json')
const query = flag('--q', '')
const offset = Number(flag('--offset', 0))
const limit = Number(flag('--limit', 20))

const client = new HeyboxClient()

try {
  let data
  let games
  if (query) {
    data = await client.get('/game/search/', { q: query, offset, limit })
    games = data.result?.games ?? []
  } else {
    const uid = heyboxId()
    if (!uid) { console.error('✗ 没有 heybox_id：先登录并写入 cookie'); process.exit(1) }
    data = await client.get('/account/game_list/', { userid: uid, offset, limit, sort: 'time' })
    games = data.result?.game_list ?? []
  }

  if (json) { console.log(JSON.stringify(data, null, 2)); process.exit(0) }

  console.log(`\n${query ? `游戏搜索：${query}` : '我的游戏库'} · ${games.length} 条\n`)
  for (const g of games) {
    const appid = g.appid ?? g.steam_appid ?? ''
    const name = g.name ?? g.game_name ?? ''
    const score = g.score ?? g.comment_score ?? g.user_score ?? ''
    const follow = g.follow_num ?? ''
    console.log(`• [${appid}] ${name}${score ? ` · 评分 ${score}` : ''}${follow ? ` · 关注 ${follow}` : ''}`)
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
