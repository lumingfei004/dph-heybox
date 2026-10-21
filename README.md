# dsh-heybox

> 给 DSH 装一个小黑盒插件：以游戏为轴刷社区、点赞、按自己的作息随机醒来。
>
> 不是"全站热榜搬运"，而是**按你玩的游戏**看帖子：信息流、帖子详情、评论、游戏库，外加点赞和生物钟。

## 它能做什么

- **浏览**：信息流、帖子详情（正文 + 话题）、评论、游戏库、话题、搜索
- **点赞**：给帖子点赞 / 取消（写操作默认只预演，加 `--go` 才发）
- **生物钟**：按作息窗口随机醒来，自己看帖、点赞、写一句日记，把值得的告诉你
- **登录态**：扫码登录，之后长期可用；只写不读回

## 装

前提：Node 18+（DSH 自带运行时即可）。

```bash
dsh plugin --profile desktop add "link:D:\My Documents\deepseek-harness\default-workspace\dsh-heybox"
```

装完**重启一次 DSH**，然后打开「设置 → 小黑盒」。

## 生物钟（随机醒）

设置页「作息」里开启「随机醒」后，插件会：

- 每天在你设定的**作息窗口里随机一个时刻**醒来（不是整点）
- 按概率「今天不想看」（默认 25%）
- 醒来后自己走一遍：看信息流 → 挑 1–3 条帖子读正文和评论 → 点赞 → 签到 → 写一句日记 → 把最想分享的一条告诉你

醒来时它会在自己的专属会话里收到一段提示，不用你说话。
状态文件：`~/.dsh/heybox-night.json`；日记：`~/.dsh/heybox-diary.md`。

## 扫码登录（推荐）

1. 打开「设置 → 小黑盒」
2. 点「扫码登录」，出现二维码（120 秒有效）
3. 用小黑盒 App 扫码并确认
4. 成功后自动写入凭据，显示「已登录 · heybox_id=…」

命令行同样可以：

```bash
node tools/heybox.mjs login --qr
```

不需要复制 Cookie，也不用手动抓包。

## 手动粘贴（兜底）

扫码不可用时，仍然可以手动写入：

```bash
node tools/heybox.mjs login "pkey=…; heybox_id=…"
```

> `pkey` 是 HttpOnly，`document.cookie` 读不到，必须从请求标头或 Application 面板复制。

## 命令

在插件目录下：

```bash
node tools/heybox.mjs login --qr        # 扫码登录（推荐）
node tools/heybox.mjs selftest          # 启动自检（离线签名 + 凭据）
node tools/heybox.mjs whoami            # 确认是哪个号
node tools/heybox.mjs feed              # 信息流
node tools/heybox.mjs link <link_id>    # 帖子详情
node tools/heybox.mjs comment <link_id> # 评论列表
node tools/heybox.mjs game              # 我的游戏库
node tools/heybox.mjs game --q 艾尔登   # 搜游戏
node tools/heybox.mjs topic 游戏        # 话题搜索
node tools/heybox.mjs search 关键词     # 搜帖子
node tools/heybox.mjs notify            # 谁找过你
node tools/heybox.mjs like <link_id>    # 点赞预演
node tools/heybox.mjs like <link_id> --go
node tools/heybox.mjs comment-post <link_id> --text "…" --go   # 发评论
node tools/heybox.mjs post --title "…" --text "…" --go         # 发文字帖
node tools/test-http.mjs                # 离线自测请求构造
node tools/test-client.mjs              # 离线自测设置页模块
```

所有读命令都支持 `--json`，方便 agent 解析。

## 签名

已用真实请求验证（`/account/restore_login` → `VTWXY78`）：

- `hkey`：字符集映射 + 交错 + MD5，**尾部 6 字节全部参与校验和**
- `_rnd`：写接口附加，HMAC-SHA256，盐值来自前端源码

细节见 `tools/lib/sign.mjs` 顶部注释。算法随小黑盒前端变化，失效时跑 `selftest` 会在「签名算法」一项报红。

## 安全约定

- 写请求**永不自动重试**；撞到验证码 / 限流立即停手
- 点赞默认只预演，必须显式 `--go`
- 请求串行限速（默认 700ms 间隔）
- 凭据单独存放 `~/.heybox-ai/credentials.json`，权限 0600，永不回显
- 设置页所有写路由只接受本机回环 + 信任栅栏

## 已知限制

- 签到已取消：小黑盒签到只认 App 签名，web 通道不可用
- 发帖 / 评论发布的图片上传尚未实现

## 目录

```
dsh-heybox/
├─ package.json
├─ cordis.patch.yml
├─ lib/
│  ├─ index.js      宿主壳：设置页路由、配置、凭据、体检
│  └─ client.js     设置页「小黑盒」section
└─ tools/
   ├─ heybox.mjs    命令路由
   ├─ lib/          sign / auth / config / http
   └─ commands/     selftest / whoami / feed / link / comment / game / topic / search / notify / signin / like
```

## 许可

MIT。与小黑盒官方无隶属关系，用你自己的账号做事，后果自负。
