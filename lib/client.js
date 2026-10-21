/**
 * dsh-heybox —— 客户端半边：DSH「设置」里的「小黑盒」section
 *
 * 数据流：section ⇄ /dsh-heybox/api/* ⇄ ~/.dsh/heybox.config.json
 * 凭据单独写 ~/.heybox-ai/credentials.json，永不回显。
 */
window.__ModuleLoader__.load({
  id: "dsh-heybox",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { createElement: h, useCallback, useEffect, useRef, useState } = React;

    const API = "/dsh-heybox/api";
    const CSS_TAG = "dsh-heybox/section.css";
    const CSS = [
      ".hbx{max-width:760px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:6px}",
      ".hbx-title{margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".hbx-intro{color:var(--dsw-alias-label-tertiary);margin:0 0 4px;font-size:13px;line-height:20px}",
      ".hbx-group{margin-top:14px;font-size:13px;font-weight:600;line-height:20px}",
      ".hbx-rows{display:flex;flex-direction:column}",
      ".hbx-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px 20px;padding:10px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}",
      ".hbx-row:last-child{border-bottom:none}",
      ".hbx-row>div:first-child{flex:1;min-width:190px}",
      ".hbx-label{font-size:13px;line-height:19px}",
      ".hbx-hint{color:var(--dsw-alias-label-tertiary);margin-top:3px;font-size:11.5px;line-height:17px}",
      ".hbx-input{background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:28px;padding:0 8px;min-width:180px;outline:none}",
      ".hbx-input:focus-visible{border-color:var(--dsw-alias-brand-primary)}",
      ".hbx-input.hbx-wide{min-width:260px}",
      ".hbx-textarea{background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;padding:8px;min-width:300px;min-height:64px;outline:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}",
      ".hbx-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}",
      ".hbx-btn{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:6px;font-size:12.5px;height:30px;padding:0 12px;cursor:pointer}",
      ".hbx-btn:disabled{opacity:.5;cursor:default}",
      ".hbx-btn2{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
      ".hbx-out{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);background:rgba(127,127,127,.08);border-radius:8px;padding:10px 12px;max-height:260px;overflow:auto;margin-top:10px}",
      ".hbx-err{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin-top:8px}",
      ".hbx-badge{display:inline-block;font-size:11px;line-height:16px;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.14);color:var(--dsw-alias-label-secondary);margin-left:6px}",
    ].join("");

    // —— 字段清单（唯一真相）——
    const FIELDS = [
      { group: "身份", path: ["owner", "heyboxId"], label: "heybox_id", hint: "写入 Cookie 后自动读出；也可手动填", kind: "text" },
      { group: "身份", path: ["owner", "name"], label: "昵称", hint: "只用于显示", kind: "text" },

      { group: "兴趣", path: ["interests", "games"], label: "在玩的游戏", hint: "逗号分隔；信息流优先看这些游戏的帖子", kind: "list" },
      { group: "兴趣", path: ["interests", "topics"], label: "关注的话题", hint: "逗号分隔", kind: "list" },

      { group: "信息流", path: ["feed", "limit"], label: "每次拉取条数", hint: "1–50", kind: "number" },
      { group: "信息流", path: ["feed", "onlySubscribed"], label: "只看订阅游戏", hint: "关掉 = 看全站动态", kind: "switch" },

      { group: "互动", path: ["like", "dailyLimit"], label: "点赞日上限", hint: "防止像刷赞；0 = 不自动点赞", kind: "number" },

      { group: "作息", path: ["night", "enabled"], label: "随机醒", hint: "按作息窗口随机醒来逛黑盒，不用你说话", kind: "switch" },
      { group: "作息", path: ["night", "skipChance"], label: "今天不想看的概率", hint: "0.25 = 四分之一的日子跳过（但仍会写一句）", kind: "number" },
      { group: "作息", path: ["night", "maxItems"], label: "一次看几条", hint: "醒来后最多深读几条帖子", kind: "number" },
    ];

    const getPath = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
    const setPath = (obj, path, value) => {
      let cur = obj;
      for (let i = 0; i < path.length - 1; i += 1) {
        const k = path[i];
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = typeof path[i + 1] === "number" ? [] : {};
        cur = cur[k];
      }
      cur[path[path.length - 1]] = value;
    };

    function useStyleOnce() {
      useEffect(() => {
        if (typeof document === "undefined") return;
        if (!document.getElementById(CSS_TAG)) {
          const el = document.createElement("style");
          el.id = CSS_TAG;
          el.textContent = CSS;
          document.head.appendChild(el);
        }
      }, []);
    }

    function Row({ f, cfg, set }) {
      const raw = getPath(cfg, f.path);
      const [listText, setListText] = useState(Array.isArray(raw) ? raw.join("，") : (raw ?? ""));
      useEffect(() => {
        setListText(Array.isArray(raw) ? raw.join("，") : (raw ?? ""));
      }, [JSON.stringify(raw ?? null)]);

      let control;
      if (f.kind === "list") {
        control = h("input", {
          className: "hbx-input hbx-wide",
          value: listText,
          onChange: (e) => {
            const v = e.target.value;
            setListText(v);
            set(f.path, v.split(/[,，]/).map((s) => s.trim()).filter(Boolean));
          },
        });
      } else if (f.kind === "number") {
        control = h("input", {
          className: "hbx-input",
          type: "number",
          value: raw ?? "",
          onChange: (e) => set(f.path, e.target.value === "" ? undefined : Number(e.target.value)),
        });
      } else if (f.kind === "switch") {
        control = h("input", {
          type: "checkbox",
          checked: !!raw,
          onChange: (e) => set(f.path, e.target.checked),
        });
      } else {
        control = h("input", {
          className: "hbx-input",
          value: raw ?? "",
          onChange: (e) => set(f.path, e.target.value),
        });
      }

      return h("div", { className: "hbx-row" },
        h("div", null,
          h("div", { className: "hbx-label" }, f.label),
          f.hint ? h("div", { className: "hbx-hint" }, f.hint) : null),
        control);
    }

    function NightEditor({ cfg, set }) {
      const wins = Array.isArray(cfg?.night?.windows) ? cfg.night.windows : [];
      const w = wins[0] ?? { start: "20:00", end: "23:00", wakes: 1 };
      const upd = (patch) => set(["night", "windows"], [{ ...w, ...patch }]);
      const inp = (value, onChange, width = "86px") =>
        h("input", {
          className: "hbx-input",
          style: { width, minWidth: width },
          value: value ?? "",
          onChange: (e) => onChange(e.target.value),
        });
      return h("div", { className: "hbx-row" },
        h("div", null,
          h("div", { className: "hbx-label" }, "作息窗口"),
          h("div", { className: "hbx-hint" }, "在窗口里随机一个时刻醒来；醒来次数 = 每天几趟")),
        h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
          inp(w.start, (v) => upd({ start: v })),
          h("span", { className: "hbx-hint" }, "–"),
          inp(w.end, (v) => upd({ end: v })),
          h("span", { className: "hbx-hint" }, "醒来"),
          h("input", {
            className: "hbx-input",
            style: { width: "56px", minWidth: "56px" },
            type: "number",
            min: 1,
            value: w.wakes ?? 1,
            onChange: (e) => upd({ wakes: Number(e.target.value) || 1 }),
          }),
          h("span", { className: "hbx-hint" }, "次")));
    }

    function HeyboxSection() {
      useStyleOnce();
      const [cfg, setCfg] = useState(null);
      const [savedJson, setSavedJson] = useState("");
      const [out, setOut] = useState("");
      const [err, setErr] = useState("");
      const [busy, setBusy] = useState("");
      const [cred, setCred] = useState({ present: false, heyboxId: "" });
      const [qr, setQr] = useState(null);          // { dataUrl, token }
      const [qrBusy, setQrBusy] = useState(false);
      const [qrMsg, setQrMsg] = useState("");
      const qrTimers = useRef({ interval: null, timeout: null });

      // 组件卸载时停掉轮询，避免 setState on unmounted
      useEffect(() => () => {
        if (qrTimers.current.interval) clearInterval(qrTimers.current.interval);
        if (qrTimers.current.timeout) clearTimeout(qrTimers.current.timeout);
      }, []);

      const load = useCallback(async () => {
        setErr("");
        try {
          const r = await fetch(`${API}/settings`, { headers: { accept: "application/json" } });
          if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 ? "（被信任栅栏拒绝）" : ""}`);
          const j = await r.json();
          setCfg(j.config ?? {});
          setSavedJson(JSON.stringify(j.config ?? {}));
          setCred(j.credentials ?? { present: false, heyboxId: "" });
          if (j.config?.owner?.heyboxId) setCred((c) => ({ ...c, heyboxId: j.config.owner.heyboxId }));
        } catch (e) {
          setErr(`读取配置失败：${e.message}`);
        }
      }, []);

      useEffect(() => { load(); }, [load]);

      const set = (path, value) => setCfg((c) => {
        const next = JSON.parse(JSON.stringify(c ?? {}));
        setPath(next, path, value);
        return next;
      });

      const save = async () => {
        setBusy("save"); setErr(""); setOut("");
        try {
          const r = await fetch(`${API}/settings`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ config: cfg ?? {} }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          setOut(`✓ 已保存\n配置：${j.configPath ?? "~/.dsh/heybox.config.json"}`);
          if (j.config) { setCfg(j.config); setSavedJson(JSON.stringify(j.config)); }
        } catch (e) {
          setErr(`保存失败：${e.message}`);
        } finally {
          setBusy("");
        }
      };

      const deps = async () => {
        setBusy("deps"); setErr(""); setOut("检查中…");
        try {
          const r = await fetch(`${API}/deps`, { headers: { accept: "application/json" } });
          const j = await r.json().catch(() => ({}));
          setOut(j.out || j.error || "（没有输出）");
          if (j.credentials) setCred(j.credentials);
        } catch (e) {
          setErr(`依赖体检失败：${e.message}`);
        } finally {
          setBusy("");
        }
      };

      const startQr = async () => {
        // 清掉上一次的轮询：否则旧二维码的 timer 会继续跑，130 秒后把新状态覆盖成「已过期」
        if (qrTimers.current.interval) clearInterval(qrTimers.current.interval);
        if (qrTimers.current.timeout) clearTimeout(qrTimers.current.timeout);
        qrTimers.current = { interval: null, timeout: null };
        setQrBusy(true); setQrMsg(""); setQr(null);
        try {
          const r = await fetch(`${API}/login/qr/start`, { method: "POST", headers: { accept: "application/json" } });
          const j = await r.json().catch(() => ({}));
          if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
          setQr({ dataUrl: j.dataUrl, token: j.token });
          setQrMsg("请用小盒 App 扫码并确认（120 秒内）");
          pollQr(j.token);
        } catch (e) {
          setQrMsg(`✗ ${e.message}`);
        } finally {
          setQrBusy(false);
        }
      };

      const pollQr = (token) => {
        let stopped = false;
        const stop = () => { if (!stopped) { stopped = true; clearInterval(timer); } };
        const timer = setInterval(async () => {
          if (stopped) return;
          try {
            const r = await fetch(`${API}/login/qr/poll?token=${encodeURIComponent(token)}`, { headers: { accept: "application/json" } });
            const j = await r.json().catch(() => ({}));
            if (j.state === "ok") {
              stop();
              setQr(null);
              if (j.verified) {
                setQrMsg(`✓ 登录成功${j.heyboxId ? ` · heybox_id=${j.heyboxId}` : ""}`);
              } else {
                setQrMsg(`⚠ 扫码完成，但登录校验没通过${j.error ? `：${j.error}` : ""}。请重新生成二维码再扫一次；如果还是不行，用命令行跑 login --qr 看详细错误。`);
              }
              // verified 优先：宿主的 credentials 可能读得比写入早，导致刚扫码成功却显示「未登录」
              if (j.verified) setCred({ present: true, heyboxId: j.heyboxId || "" });
              else if (j.credentials) setCred(j.credentials);
              if (j.heyboxId) {
                set(["owner", "heyboxId"], j.heyboxId);
                setQr((q) => q); // 保持
              }
            } else if (j.state === "expired" || j.state === "error") {
              stop();
              setQr(null);
              setQrMsg(j.state === "expired" ? "✗ 二维码已过期，请重新生成" : `✗ ${j.error || "轮询失败"}`);
            }
          } catch { /* 继续轮询 */ }
        }, 2000);
        qrTimers.current.interval = timer;
        qrTimers.current.timeout = setTimeout(() => { stop(); setQr(null); setQrMsg((m) => m.startsWith("✓") ? m : "✗ 二维码已过期，请重新生成"); }, 130000);
      };

      if (!cfg) {
        return h("div", { className: "hbx" },
          h("h3", { className: "hbx-title" }, "小黑盒"),
          err ? h("div", { className: "hbx-err" }, err) : h("div", { className: "hbx-hint" }, "读取中…"));
      }

      const groups = [];
      for (const f of FIELDS) {
        let g = groups.find((x) => x.name === f.group);
        if (!g) { g = { name: f.group, fields: [] }; groups.push(g); }
        g.fields.push(f);
      }

      return h("div", { className: "hbx" },
        h("h3", { className: "hbx-title" }, "小黑盒"),
        h("p", { className: "hbx-intro" },
          "以游戏为轴的小黑盒插件：浏览信息流 / 帖子 / 评论 / 游戏库，每日签到，点赞。",
          "所有值写进 ", h("code", null, "~/.dsh/heybox.config.json"),
          "；凭据单独存放且永不回显。"),

        ...groups.map((g) => h("div", { key: g.name },
          h("div", { className: "hbx-group" }, g.name),
          h("div", { className: "hbx-rows" }, g.fields.map((f) => h(Row, { key: f.path.join("."), f, cfg, set }))))),

        h("div", { className: "hbx-group" }, "作息"),
        h("div", { className: "hbx-rows" }, h(NightEditor, { cfg, set })),

        h("div", { className: "hbx-group" }, "扫码登录"),
        h("div", { className: "hbx-rows" },
          h("div", { className: "hbx-row" },
            h("div", null,
              h("div", { className: "hbx-label" }, "登录状态"),
              h("div", { className: "hbx-hint" },
                cred.present
                  ? `当前：已登录${cred.heyboxId ? ` · heybox_id=${cred.heyboxId}` : ""}`
                  : "当前：未登录"),
              h("div", { className: "hbx-hint" },
                "点「扫码登录」生成二维码，用小盒 App 扫码并确认；成功后自动写入凭据，不需要复制 Cookie。")),
            h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start" } },
              qr ? h("img", {
                src: qr.dataUrl,
                width: 200,
                height: 200,
                style: { borderRadius: "8px", background: "#fff", padding: "4px" },
              }) : null,
              h("button", { className: "hbx-btn", onClick: startQr, disabled: !!qrBusy },
                qrBusy ? "生成中…" : (qr ? "重新生成" : "扫码登录")),
              qrMsg ? h("div", { className: qrMsg.startsWith("✓") ? "hbx-hint" : "hbx-err" }, qrMsg) : null))),

        h("div", { className: "hbx-actions" },
          h("button", { className: "hbx-btn", onClick: save, disabled: !!busy }, busy === "save" ? "保存中…" : "保存"),
          cfg && savedJson && JSON.stringify(cfg) !== savedJson
            ? h("span", { style: { marginLeft: "10px", color: "#ffb020", fontSize: "13px" } }, "● 有改动还没保存")
            : null,
          h("button", { className: "hbx-btn hbx-btn2", onClick: deps, disabled: !!busy }, busy === "deps" ? "体检中…" : "依赖体检"),
          h("button", { className: "hbx-btn hbx-btn2", onClick: load, disabled: !!busy }, "重新读取")),

        err ? h("div", { className: "hbx-err" }, err) : null,
        out ? h("div", { className: "hbx-out" }, out) : null,
        h("div", { className: "hbx-hint" }, "装完先点「依赖体检」：签名 / 凭据 / 登录态 都 ✓ 才算可用。"));
    }

    const inject = ["slots"];
    const NS = "dsh-heybox";

    function apply(ctx) {
      ctx.effect(
        () => ctx.slots.inject("settings.section", () =>
          ctx.slots.register(
            { name: "settings.section", id: NS, order: 7, label: () => "小黑盒" },
            HeyboxSection,
          ), "dsh-heybox: settings section"),
        "dsh-heybox: settings section",
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.HeyboxSection = HeyboxSection;
    exports.FIELDS = FIELDS;
    return module.exports;
  },
});
