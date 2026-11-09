<p align="center">
  <img src="public/favicon.svg" width="120" alt="Re Player logo" />
</p>

<div align="center">

# 🎬 Re Player (RP)

**A link-based media library built with Astro, running on Cloudflare Workers**

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-7-orange)](https://astro.build)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)

</div>

---

## 📝 About

Re Player is a **link-based media library**. An administrator mounts external videos, audio, and images under a virtual `/root` directory, and visitors browse the tree on the left while playing media in the browser player on the right. No storage provider is mounted directly. The project runs on **Astro + Cloudflare Workers**, with no dedicated server required.

**Repository**: [github.com/lircia/RP-Re_Player](https://github.com/lircia/RP-Re_Player)

> [!NOTE]
> This project is open-sourced under the **MIT** license. You are free to use, modify, and redistribute it.
>
> The project includes `movi-player` 0.4.1, which is distributed under the Apache License 2.0 together with its listed third-party components. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and the included [movi-player license text](THIRD-PARTY-NOTICES) for the applicable notices.

## 🚀 Quick Start

### Requirements

- **Node.js ≥ 22** (required by Astro 7)
- **npm** or **pnpm**

### Run Locally

> [!NOTE]
> Local running through `Local.cmd` in the main repository is incomplete and can only be accessed from the same computer. To access the service from other devices on your LAN, download the release package and read its bundled README.

```bash
npm install
npm run local
```

By default the service listens at `http://127.0.0.1:12067` over HTTP. Override the port with `RP_HTTP_PORT` if needed. On Debian/Linux, Wrangler's interactive dev UI is disabled.

The default administrator password is `masteradmin`. Open `/admin` manually to sign in; set the environment variable `P` to change the password.

### Deploy to Cloudflare Workers

```bash
npm run cf:deploy
```

No change to Cloudflare's build command is required.

## ✨ Features

- **🎞️ Multi-format playback** — video, audio, and image in one player
- **🗂️ Link pseudo-mounts** — mount any external media URL under the fixed `/root` path
- **📝 ASS subtitles** — rendered in-browser with JASSUB/libass plus bundled SC/JP font fallbacks
- **🎤 LRC lyrics** — real-time synced highlighting with optional bilingual tracks
- **🌍 Auto language** — IP-based English / 简体中文 / 日本語 selection with manual override
- **📊 Visitor analytics** — `/table` shows visit, directory, media, and play events
- **🌗 Five themes** — Default, Retro, Azure, New Blue, Light Gray, switched from one admin button
- **🔒 Password protected** — both `/admin` and `/table` require the administrator password
- **💾 D1 persistence** — falls back to in-memory storage when D1 is unavailable
- **📈 Umami analytics** — optional [Umami](https://umami.is) integration

## 🌐 Public Routes

| Route | Purpose |
| --- | --- |
| `/` | Entry animation; mobile devices go to `/Local` |
| `/Re` | Entry animation page (external intro media, then `/Loading`) |
| `/Loading` | Choose language, then `Start` to enter the visitor page |
| `/Local` | Regular visitor media library |
| `/Local/Pash/...` | Regular pseudo-mount display URLs |
| `/Tree/...` | Native player page for media mounted at `/root/tree` |
| `/table` | Visitor analytics page (requires the admin password) |
| `/admin` | Admin console (pseudo-mounts, themes, settings) |

`Tree` sits at the same level as `Local` but is not shown in the regular Local listing; register a folder as `/tree` in the admin console.

## ☁️ Cloudflare D1

The project already has an active D1 binding in `wrangler.toml`. When deploying to another Cloudflare account, create a D1 database and replace `database_name` and `database_id`:

```toml
[[d1_databases]]
binding = "D1"
database_name = "your-database-name"
database_id = "your-cloudflare-d1-database-id"
```

RP creates and upgrades the following tables automatically:

| Table | Purpose |
| --- | --- |
| `rp_pseudo_links` | Pseudo-mount information |
| `rp_media_visitors` | Per-visitor media progress and completion stats |
| `rp_visitor_events` | Visit, directory, media, and play events |
| `rp_settings` | Persisted environment variables |
| `rp_visitor_theme` | Public-page visitor theme |

The D1 binding name must remain `D1`. Also configure a KV namespace binding named `KV` in the Cloudflare environment; do not commit an empty KV namespace ID to this repository.

## 🔧 Environment Variables

| Variable | Purpose |
| --- | --- |
| `A` | External media URL shown before the visitor page |
| `B` | Maximum display/playback time for `A` and `C`, in seconds; default `4.2` |
| `C` | Optional external audio URL played together with `A`; mutes the `A` video when set |
| `N` | Site name |
| `P` | Administrator password |
| `WM` | Movi subtitle size multiplier; default `0.78` (accepted range `0.1`–`3`) |
| `PBN` | Video control bar glass background opacity; default `0.12` (`0` transparent, `1` opaque) |
| `DB` | Storage selection for pseudo-mounts and visitor theme: `d1` or `kv`; defaults to `d1` |
| `D1` | D1 binding; playback stats, visitor events, settings, and KV backups remain in D1 |
| `US` | Umami script URL |
| `UI` | Umami website ID |
| `UH` | Optional Umami host URL |
| `UD` | Optional Umami domain list |

When D1 is available, RP seeds `rp_settings` from non-empty `A`, `B`, `C`, `N`, `P`, `US`, `UI`, `UH`, and `UD` bindings when their `env:VARIABLE` keys are missing; stored values take priority on later deployments. `WM` and `PBN` are read directly from the runtime environment and are not stored in D1, so they can be adjusted there without changing saved settings. `keep_vars = true` also prevents Wrangler from deleting variables configured in the Cloudflare dashboard.

Pseudo-mount links and the visitor theme use KV only when `DB` is set to `kv` and the `KV` binding exists; without that binding, or for any other `DB` value, they automatically use D1. Playback progress, analytics, visitor events, settings, and migration state always remain in D1. In KV mode, mount creation/deletion and theme changes are also written to D1 as backups. If KV initialization markers are missing, the KV data is rebuilt from those D1 backups.

## 📖 Details

### ASS Subtitles

When adding a video, enter a public HTTP(S) URL to an `.ass` subtitle file. RP fetches the configured subtitle through its own public subtitle endpoint, avoiding ordinary browser CORS restrictions. The player requests small Noto Sans subsets for the characters used by each subtitle; bundled SC/JP fonts remain as a fallback when the font service is unavailable. The subtitle source must still be reachable from Cloudflare Workers.

MKV files without an external subtitle use the first embedded ASS track by default. Enabling **H5 difficult playback** in the admin console switches only that video to [movi-player](https://github.com/MrUjjwalG/movi-player), which reads the Matroska tracks in the browser and provides a subtitle selector for all embedded tracks. Videos with the option disabled continue using the existing native HTML5/JASSUB path. External ASS subtitles in the Movi path are converted to browser-compatible WebVTT; full ASS styling remains available on the native path. Movi uses HTTP Range requests for progressive loading, so the media proxy preserves upstream `206 Partial Content` responses and disables caching for the media endpoint. See Cloudflare's [Range request behavior](https://developers.cloudflare.com/cache/reference/range-requests/) and [Workers Cache limitations](https://developers.cloudflare.com/workers/cache/limitations/): Workers Cache does not store a Worker response that is already `206`, so do not force this endpoint to return a synthetic `200`.

Set `WM` to change the Movi subtitle size multiplier (default `0.78`, accepted range `0.1`–`3`). Set `PBN` to change the video control bar's glass background opacity (default `0.12`; `0` is transparent and `1` is opaque).

### LRC Lyrics

When adding audio, enter a public HTTP(S) `.lrc` URL for synchronized lyrics. Enable **Bilingual lyrics** to add a second-language file. RP proxies both files to avoid CORS restrictions, highlights and scrolls the current line in real time, and places detected Chinese lyrics above the foreign-language line. If language detection is inconclusive, the other-language file appears above the default file. A single LRC containing two lines at the same timestamp is adapted automatically.

### Automatic Language

When no manual language preference has been saved, RP uses the free, keyless `api.country.is` service to determine the visitor country: `CN` selects Simplified Chinese, `JP` selects Japanese, and every other country selects English. Cloudflare's request country is used as a fallback when the lookup service is unavailable. A manual selection is stored in local storage and the `rp_l` cookie. Per-media `rp_p_*` cookies store every audio/video path and playback position on that device; completed media remains recorded at its full duration.

## 📁 Directory Structure

```
RP-Re_Player
├── src/                        # Source code
│   ├── layouts/                # Page layouts
│   ├── lib/                    # Business logic (pseudo-mounts, subtitles, lyrics, themes…)
│   ├── pages/                  # Route pages
│   │   ├── api/                # API endpoints
│   │   │   ├── admin/          # Admin APIs
│   │   │   └── public/         # Visitor/public APIs
│   │   ├── Local/              # Visitor media library
│   │   └── tree/               # Native player
│   ├── styles/                 # Global and theme styles
│   └── types/                  # Type definitions
├── public/                     # Static assets (fonts, icon, poster)
├── scripts/                    # Build and local-run scripts
├── astro.config.mjs            # Astro configuration
├── wrangler.toml               # Cloudflare configuration
├── package.json                # Project dependencies
└── LICENSE                     # MIT license
```

## 🙏 Acknowledgements

- [Astro](https://astro.build) — Web framework
- [JASSUB](https://github.com/ThaUnknown/jassub) / [libass](https://github.com/libass/libass) — ASS subtitle rendering
- [movi-player](https://github.com/MrUjjwalG/movi-player) — media player
- [Umami](https://umami.is) — optional website analytics

## ⚖️ License

The original Re Player source code is licensed under the [MIT License](LICENSE). Third-party dependencies retain their own licenses; in particular, `movi-player` 0.4.1 is licensed under Apache License 2.0. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) before redistributing a build.
