/**
 * 配置层：一份 JSON 承载所有"属于使用者"的设置。
 *
 * 路径：~/.dsh/heybox.config.json（可用 HEYBOX_CONFIG 覆盖）
 * 与宿主壳 lib/index.js 读写同一份文件，不存在两套配置。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.USERPROFILE || os.homedir()
export const configPath = process.env.HEYBOX_CONFIG || path.join(HOME, '.dsh', 'heybox.config.json')

export const DEFAULTS = {
  owner: { heyboxId: '', name: '' },
  // 小黑盒是"游戏为轴"的社区：默认只看订阅的游戏
  interests: { games: [], topics: [] },
  feed: { limit: 20, onlySubscribed: false },
  like: { dailyLimit: 20 },
  notify: { type: 'none', url: '' },
  night: {
    enabled: true,
    windows: [{ start: '20:00', end: '23:00', wakes: 1 }],
    skipChance: 0.25,
    maxItems: 3,
  },
}

const merge = (base, over) => {
  const out = { ...base }
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] ?? {}, v) : v
  }
  return out
}

let cache = null

export function config() {
  if (cache) return cache
  let user = {}
  try { user = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { /* 没配置就用默认 */ }
  cache = merge(DEFAULTS, user)
  cache.__hasUserFile = Object.keys(user).length > 0
  return cache
}

export function writeConfig(next) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + '\n')
  cache = next
  return next
}

/** 浅合并 + 基础范围校验（供宿主壳调用） */
export function updateConfig(patch) {
  const cur = { ...config() }
  delete cur.__hasUserFile
  const next = merge(cur, patch || {})
  if (next.feed) {
    next.feed.limit = Math.min(50, Math.max(1, Number(next.feed.limit) || 20))
  }
  if (next.like) {
    next.like.dailyLimit = Math.min(100, Math.max(0, Number(next.like.dailyLimit) || 20))
  }
  return writeConfig(next)
}
