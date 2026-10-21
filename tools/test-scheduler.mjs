/**
 * 生物钟离线测试：mock sessionController + 临时 dshHome，验证 tick 会生成计划。
 * 运行：node tools/test-scheduler.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startScheduler } from '../lib/scheduler.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'heybox-night-'))
let failure = 0
const check = (ok, name, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failure += 1
}

let created = 0
let prompted = 0
const ctx = {
  sessionController: {
    create: async () => { created += 1 },
    prompt: async () => { prompted += 1 },
  },
}

const sched = startScheduler(ctx, { dshHome: tmp, toolsMjs: path.join(tmp, 'nope.mjs'), log: (m) => console.log('  ' + m) })
await new Promise((r) => setTimeout(r, 300))

const statePath = path.join(tmp, 'heybox-night.json')
check(fs.existsSync(statePath), '生成了 heybox-night.json', statePath)

if (fs.existsSync(statePath)) {
  const st = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  check(st.date === new Date().toLocaleDateString('sv-SE'), 'date = 今天', st.date)
  check(['wake', 'skip', 'done'].includes(st.action), 'action 合法', st.action)
  if (st.action !== 'done') {
    check(typeof st.at === 'number' && st.at > 0, 'at 是分钟数', String(st.at))
    check(/^\d{2}:\d{2}$/.test(st.atText ?? ''), 'atText 是 HH:MM', st.atText)
  }
}

sched.stop()
check(created >= 0, '未创建会话（还没到点）', `created=${created} prompted=${prompted}`)

console.log(failure ? `\n${failure} 项失败` : '\n全部通过 ✓')
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failure ? 1 : 0)
