/**
 * 离线测试 client.js：模拟 DSH 的 __ModuleLoader__，确认导出结构与 apply/inject。
 * 运行：node tools/test-client.mjs
 */
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

let loaded = null
const sandbox = {
  window: { __ModuleLoader__: { load: (def) => { loaded = def } } },
  console,
  document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  setInterval: () => 0,
  clearInterval: () => {},
}
vm.runInNewContext(src, sandbox)

let failed = 0
const check = (ok, name, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

check(Boolean(loaded), '注册了 __ModuleLoader__.load')
check(loaded?.id === 'dsh-heybox', 'id = dsh-heybox', loaded?.id)
check(typeof loaded?.factory === 'function', 'factory 是函数')

const React = {
  createElement: () => null,
  useCallback: (f) => f,
  useEffect: () => 0,
  useState: (v) => [v, () => {}],
}
const mod = loaded.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unknown require: ${name}`)
})
check(typeof mod.apply === 'function', '导出 apply')
check(Array.isArray(mod.inject) && mod.inject.includes('slots'), '导出 inject = [slots]', JSON.stringify(mod.inject))
check(typeof mod.HeyboxSection === 'function', '导出设置页组件')
check(Array.isArray(mod.FIELDS) && mod.FIELDS.length > 0, '导出字段清单', `${mod.FIELDS?.length} 项`)

// apply 不应该抛错（用一个记录调用的 ctx mock）
const calls = []
const ctx = {
  effect: (fn) => { calls.push('effect'); try { fn() } catch { /* 忽略渲染期异常 */ } },
  slots: {
    inject: (name, fn) => { calls.push('inject:' + name); return fn() },
    register: (opts, comp) => { calls.push('register:' + opts.id); return () => {} },
  },
}
try {
  mod.apply(ctx)
  check(calls.some((c) => c.startsWith('inject:settings.section')), 'apply 注入 settings.section')
  check(calls.includes('register:dsh-heybox'), 'apply 注册 section')
} catch (e) {
  check(false, 'apply 不抛错', e.message)
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过 ✓')
process.exit(failed ? 1 : 0)
