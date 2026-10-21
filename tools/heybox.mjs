#!/usr/bin/env node
// 统一入口：node heybox.mjs <命令> [参数...]
// 参数原样透传给 commands/ 下的具体脚本。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const map = {
  // —— 只读（安全） ——
  selftest: ['commands/selftest.mjs', '启动自检：签名/凭据/登录态/配置'],
  whoami: ['commands/whoami.mjs', '确认凭据属于哪个号（restore_login）'],
  feed: ['commands/feed.mjs', '信息流：小黑盒首页动态 [--offset N] [--limit N] [--json]'],
  link: ['commands/link.mjs', '帖子详情：<link_id> [--json]'],
  comment: ['commands/comment.mjs', '评论列表：<link_id> [--offset N] [--limit N] [--json]'],
  game: ['commands/game.mjs', '游戏库：列表 / 搜索 / 详情 [--q 关键词] [--json]'],
  topic: ['commands/topic.mjs', '话题搜索：<关键词> [--offset N] [--limit N] [--json]'],
  search: ['commands/search.mjs', '搜索帖子：<关键词> [--json]'],
  notify: ['commands/notify.mjs', '谁找过你（通知） [--type 0|1|2|3] [--json]'],
  // —— 写（会真的发出去；必须 --go，默认只预演） ——
  login: ['commands/login.mjs', '写入登录 cookie：login "pkey=…; heybox_id=…" 或直接 login 后粘贴'],
  like: ['commands/like.mjs', '点赞 / 取消点赞：<link_id> [--undo] --go'],
  'comment-post': ['commands/comment-post.mjs', '发评论：<link_id> --text "…" [--reply-id X --root-id Y] --go'],
  post: ['commands/post.mjs', '发帖（文字）：--title "…" --text "…" [--draft] --go'],
}

const [cmd, ...rest] = process.argv.slice(2)

if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
  console.log('用法: node heybox.mjs <命令> [参数...]\n')
  console.log('命令:')
  for (const [name, [, desc]] of Object.entries(map)) console.log(`  ${name.padEnd(10)} ${desc}`)
  console.log('\n安全约定:')
  console.log('  · 写操作默认只预演；加 --go 才真的发')
  console.log('  · 先跑 selftest 确认凭据可用；写操作后用 link / comment 回读复核')
  process.exit(cmd ? 0 : 2)
}

const entry = map[cmd]
if (!entry) {
  console.error(`未知命令: ${cmd}\n跑 "node heybox.mjs help" 看清单。`)
  process.exit(2)
}

const r = spawnSync(process.execPath, [path.join(here, entry[0]), ...rest], { stdio: 'inherit' })
process.exit(r.status ?? 1)
