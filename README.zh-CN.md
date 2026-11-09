<p align="center">
  <img src="public/favicon.svg" width="120" alt="Re Player logo" />
</p>

<div align="center">

# 🎬 Re Player (RP)

**基于 Astro + Cloudflare Workers 的链接型媒体库**

[English](README.md) · 简体中文 · [日本語](README.ja.md)

[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-7-orange)](https://astro.build)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)

</div>

---

## 📝 项目简介

Re Player 是一个**基于链接的媒体库**：管理员在后台将外部视频、音频、图片挂载为虚拟 `/root` 目录，访客在左侧浏览目录树、在右侧网页播放器中直接播放。项目不直接挂载任何存储服务，运行于 **Astro + Cloudflare Workers**，无需自备服务器。

**仓库地址**：[github.com/lircia/RP-Re_Player](https://github.com/lircia/RP-Re_Player)

> [!NOTE]
> 本项目基于 **MIT** 许可证开源，你可以自由使用、修改和分发。
>
> 项目包含 `movi-player` 0.4.1，该组件采用 Apache License 2.0，并同时包含其列出的第三方组件许可证。具体版权和许可证说明请查看 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 以及附带的 [movi-player 许可证原文](THIRD-PARTY-NOTICES)。

## 🚀 快速开始

### 环境要求

- **Node.js ≥ 22**（Astro 7 要求）
- **npm** 或 **pnpm**

### 本地运行

> [!NOTE]
> 主仓库中的 `Local.cmd` 本地运行功能并不完整，只能在运行服务的本机访问。如需通过局域网内的其他设备访问，请下载发布包并阅读包内 README。

```bash
npm install
npm run local
```

默认通过 HTTP 监听 `http://127.0.0.1:12067`；可通过 `RP_HTTP_PORT` 修改端口。Debian/Linux 下会关闭 Wrangler 交互式开发 UI。

默认管理员密码为 `masteradmin`，手动打开 `/admin` 登录；设置环境变量 `P` 可修改密码。

### 部署到 Cloudflare Workers

```bash
npm run cf:deploy
```

无需修改 Cloudflare 的构建命令。

## ✨ 功能特性

- **🎞️ 多格式播放**：视频、音频、图片一键播放
- **🗂️ 链接伪挂载**：在固定 `/root` 下挂载任意外部媒体链接
- **📝 ASS 字幕**：JASSUB/libass 浏览器渲染，内置中/日文字体回退
- **🎤 LRC 歌词**：实时同步、自动高亮滚动，支持双语歌词
- **🌍 自动语言**：按 IP 自动选择中/英/日，支持手动覆盖
- **📊 访客统计**：`/table` 查看访问、目录、媒体、播放事件
- **🌗 五套主题**：默认、复古、蔚蓝、新蓝、浅灰一键切换
- **🔒 密码保护**：`/admin` 后台与 `/table` 统计页均需管理员密码
- **💾 D1 持久化**：无 D1 时自动回退内存存储
- **📈 Umami 统计**：可选接入 [Umami](https://umami.is) 分析

## 🌐 公开路由

| 路由 | 说明 |
| --- | --- |
| `/` | 入口动画，移动端跳转 `/Local` |
| `/Re` | 入口动画页（外部 intro 媒体后进入 `/Loading`） |
| `/Loading` | 选择语言后进入访客页面 |
| `/Local` | 常规访客媒体库 |
| `/Local/Pash/...` | 常规伪挂载展示 URL |
| `/Tree/...` | `/root/tree` 挂载媒体的原生播放器页面 |
| `/table` | 访客统计页（需管理员密码） |
| `/admin` | 管理后台（伪挂载、主题、设置） |

`Tree` 与 `Local` 同层级，但在常规 Local 列表中不显示；请在管理后台将文件夹注册为 `/tree`。

## ☁️ Cloudflare D1

项目已在 `wrangler.toml` 中启用 D1 绑定。部署到其他 Cloudflare 账户时，创建 D1 数据库并替换 `database_name` 和 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "your-database-name"
database_id = "your-cloudflare-d1-database-id"
```

RP 会自动创建并升级以下数据表：

| 数据表 | 用途 |
| --- | --- |
| `rp_pseudo_links` | 伪挂载信息 |
| `rp_media_visitors` | 媒体播放进度与完播统计 |
| `rp_visitor_events` | 访问、目录、媒体、播放事件 |
| `rp_settings` | 保存的环境变量 |
| `rp_visitor_theme` | 公开页访客主题 |

D1 绑定名必须保持为 `DB`。

## 🔧 环境变量

| 变量 | 用途 |
| --- | --- |
| `A` | 访客页打开前显示的外部媒体地址 |
| `B` | `A` 与 `C` 的最大显示或播放时间（秒），默认 `4.2` |
| `C` | 与 `A` 同时播放的可选外部音频地址；设置后 `A` 视频静音 |
| `N` | 网站名称 |
| `P` | 管理员密码 |
| `WM` | Movi 播放器字幕缩放倍率；默认 `0.78`（有效范围 `0.1`–`3`） |
| `PBN` | 视频进度控制层玻璃背景透明度；默认 `0.12`（`0` 完全透明，`1` 不透明） |
| `DB` | D1 绑定 |
| `US` | Umami 脚本地址 |
| `UI` | Umami 网站 ID |
| `UH` | 可选 Umami 主机地址 |
| `UD` | 可选 Umami 域名列表 |

D1 可用时，RP 会在对应 `env:变量名` 键尚不存在时，将非空的 `A`、`B`、`C`、`N`、`P`、`US`、`UI`、`UH` 和 `UD` 绑定写入 `rp_settings`；后续部署优先读取数据库中的值。`WM` 与 `PBN` 则直接读取运行时环境变量，不写入 D1，因此可直接调整而不受已保存设置覆盖。`keep_vars = true` 也会阻止 Wrangler 删除在 Cloudflare 控制台中配置的变量。

## 📖 功能详解

### ASS 字幕

添加视频时可填写公开 HTTP(S) `.ass` 字幕链接。RP 通过站内字幕接口读取字幕，避免浏览器 CORS 限制；播放器按字幕实际使用字符请求小型 Noto Sans 字体子集，字体服务不可用时回退到站内 SC/JP 字体。字幕来源仍需能被 Cloudflare Workers 访问。

没有外置字幕的 MKV 视频，默认只读取第一条内置 ASS 字幕。管理后台的选项现改为 **H5 难以播放**：勾选后仅该视频改用 [movi-player](https://github.com/MrUjjwalG/movi-player)，在浏览器端读取 Matroska 内置轨道，并可在所有内置字幕之间切换；未勾选的视频仍使用原有 HTML5/JASSUB 处理方式。Movi 分支会将外置 ASS 转换为浏览器可用的 WebVTT，完整 ASS 样式仍由未勾选分支提供。Movi 依赖 HTTP Range 边下边播，媒体代理会保留上游的 `206 Partial Content` 响应并禁用媒体接口缓存。详见 Cloudflare 的 [Range 行为文档](https://developers.cloudflare.com/cache/reference/range-requests/) 与 [Workers Cache 限制](https://developers.cloudflare.com/workers/cache/limitations/)：Workers Cache 不会存储 Worker 直接返回的 `206`，因此不要为了缓存强制改成伪造的 `200`，否则可能破坏 Range 播放。

设置 `WM` 可调整 Movi 字幕缩放倍率（默认 `0.78`，有效范围 `0.1`–`3`）；设置 `PBN` 可调整视频进度控制层的玻璃背景透明度（默认 `0.12`，`0` 完全透明，`1` 不透明）。

### LRC 歌词

添加音频时可填写一个公开 `.lrc` 歌词链接；开启 **双语歌词** 后可再填写另一语言歌词链接。RP 通过站内接口读取歌词以避免 CORS 限制，实时高亮并滚动当前行。检测到中文轨时中文在上、外语在下；无法判断语言时则相反。单个 LRC 中相同时间戳含两行内容时自动适配为双行显示。

### 自动语言

浏览器尚未保存手动语言偏好时，RP 调用免费且无需密钥的 `api.country.is` 查询访客国家：`CN` → 简体中文，`JP` → 日语，其他 → 英语；查询失败时回退到 Cloudflare 请求中的国家信息。手动选择同时保存在本地存储和 `rp_l` Cookie 中；每个媒体使用独立的 `rp_p_*` Cookie 保存播放位置，完播媒体保留完整时长。

## 📁 目录结构

```
RP-Re_Player
├── src/                        # 源码
│   ├── layouts/                # 页面布局
│   ├── lib/                    # 业务逻辑（伪挂载、字幕、歌词、主题等）
│   ├── pages/                  # 路由页面
│   │   ├── api/                # API 接口
│   │   │   ├── admin/          # 管理后台接口
│   │   │   └── public/         # 访客公开接口
│   │   ├── Local/              # 访客媒体库
│   │   └── tree/               # 原生播放器
│   ├── styles/                 # 全局与主题样式
│   └── types/                  # 类型定义
├── public/                     # 静态资源（字体、图标、海报）
├── scripts/                    # 构建与本地运行脚本
├── astro.config.mjs            # Astro 配置
├── wrangler.toml               # Cloudflare 配置
├── package.json                # 项目依赖
└── LICENSE                     # MIT 许可证
```

## 🙏 致谢

- [Astro](https://astro.build) — Web 框架
- [JASSUB](https://github.com/ThaUnknown/jassub) / [libass](https://github.com/libass/libass) — ASS 字幕渲染
- [movi-player](https://github.com/MrUjjwalG/movi-player) — 媒体播放器
- [Umami](https://umami.is) — 可选网站分析

## ⚖️ 许可证说明

Re Player 自有源代码采用 [MIT 许可证](LICENSE)。第三方依赖仍分别遵循各自许可证；其中 `movi-player` 0.4.1 采用 Apache License 2.0。重新分发构建产物前，请阅读 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
