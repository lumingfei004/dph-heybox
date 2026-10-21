/**
 * 模拟 DSH 宿主：加载插件入口并调用 apply，确认不抛错。
 * 运行：node tools/test-host.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const entry = path.join(here, '..', 'lib', 'index.js')

const mod = await import('file:///' + entry.replace(/\\/g, '/').replace(/ /g, '%20'))
const plugin = mod.default

let failed = 0
const check = (ok, name, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

check(plugin?.name === 'dsh-heybox', 'name', plugin?.name)
check(Array.isArray(plugin?.inject), 'inject', JSON.stringify(plugin?.inject))
check(typeof plugin?.apply === 'function', 'apply 是函数')

const registered = []
const ctx = {
  get: (name) => (name === 'connection' ? { requestRejection: () => false } : undefined),
  webServer: { register: (route) => { registered.push(route.path); return () => {} } },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {}; },
}

try {
  plugin.apply(ctx)
  check(true, 'apply() 不抛错')
  check(registered.length > 0, '注册了路由', registered.join(', '))
} catch (e) {
  check(false, 'apply() 抛错', e.stack?.split('\n').slice(0, 3).join(' | '))
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过 ✓')
process.exit(failed ? 1 : 0)
