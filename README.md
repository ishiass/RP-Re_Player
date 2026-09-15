# Re Player (RP)

English | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

Re Player is a link-based media library that uses the Astro framework and runs on Cloudflare Workers. Visitors browse a virtual `/root` tree in the left panel and play video, audio, or images in the browser player on the right. No storage provider is mounted directly.

## Features

- Link pseudo-mounts under the required `/root` path
- Video, audio, and image playback
- Optional ASS subtitles rendered in the browser with JASSUB/libass and bundled Chinese/Japanese font fallbacks
- Synchronized LRC lyrics with single-file adaptation and optional bilingual tracks
- Automatic IP-based English, Simplified Chinese, or Japanese selection with a manual override
- Visitor cookies remember the selected language and each audio/video file's playback position, including completed positions
- Password-protected `/admin` console with a management-style table
- Five D1-backed visitor themes switched from one admin button: Default, Retro, Azure, New Blue, and Light Gray
- Cloudflare D1 persistence with an in-memory local fallback
- Optional Umami analytics

## Local Run

> [!NOTE]
> Local running through Local.cmd in the main repository is incomplete and can only be accessed from the same computer. To access the service from other devices on your LAN, download the release package and read the README included with it, or download and run the code from this repository's local branch.

Run `Local.cmd` to build RP and open HTTP port `80` plus HTTPS port `443`. With the default `IP=127.0.0.1`, it displays `soers.de5.net`. For the configured loopback records, `127.0.0.N` maps to `2N.soers.de5.net` and `172.0.0.N` maps to `7N.soers.de5.net` for `N=0-9`; `127.0.0.1` is the root-domain exception. Other addresses are displayed directly. Wrangler's local HTTPS certificate may require browser trust confirmation.

The equivalent command is:

```bash
npm install
npm run local
```

The default administrator password is `masteradmin`. Open `/admin` manually to sign in. Set `P` to change the password.

After signing in, use the visitor-theme button to the left of the language selector. One button cycles through Default, Retro, Azure, New Blue, and Light Gray; the selection is stored in D1 and applies to the public visitor page only.

## Cloudflare D1

The current project already has an active D1 binding in `wrangler.toml`. When deploying to another Cloudflare account, create a D1 database and replace `database_name` and `database_id` with that database's values:

```toml
[[d1_databases]]
binding = "DB"
database_name = "your-database-name"
database_id = "your-cloudflare-d1-database-id"
```

RP creates and upgrades the `rp_pseudo_links`, `rp_media_stats`, `rp_settings`, and `rp_visitor_theme` tables automatically. The D1 binding name must remain `DB`.

## Short Variables

| Variable | Purpose |
| --- | --- |
| `A` | External media URL shown before the visitor page |
| `B` | Maximum playback/display time for `A` and `C`, in seconds; default `4.2` |
| `C` | Optional external audio URL played with `A`; when set, the `A` video is muted |
| `N` | Site name |
| `P` | Administrator password |
| `DB` | D1 binding |
| `US` | Umami script URL |
| `UI` | Umami website ID |
| `UH` | Optional Umami host URL |
| `UD` | Optional Umami domain list |

When D1 is available, RP copies each non-empty bound short variable into `rp_settings` the first time its `env:VARIABLE` key is missing. Stored values take priority on later deployments; unbound or empty variables are not written. `keep_vars = true` also prevents Wrangler from deleting variables configured in the Cloudflare dashboard.

## Umami

Umami loads only when both `US` and `UI` are configured:

```text
US=https://cloud.umami.is/script.js
UI=your-website-id
```

`UH` and `UD` map to Umami's optional `data-host-url` and `data-domains` tracker settings.

## ASS Subtitles

When adding a video, enter a public HTTP(S) URL to an `.ass` subtitle file. RP fetches that configured subtitle through its own public subtitle endpoint, which avoids ordinary browser CORS restrictions. The player requests small Noto Sans subsets for the characters used by each subtitle; locally hosted SC/JP files remain as a fallback when the font service is unavailable. The subtitle source must still be reachable from Cloudflare Workers.

## LRC Lyrics

When adding audio, enter one public HTTP(S) `.lrc` URL for synchronized lyrics. Enable **Bilingual lyrics** to add a second language file. RP proxies both files to avoid ordinary browser CORS restrictions, highlights and scrolls the current line in real time, and places detected Chinese lyrics above the foreign-language line. If language detection is inconclusive, the other-language file appears above the default file. A single LRC containing two lines at the same timestamp is adapted automatically.

## Automatic Language

When no manual language preference has been saved, RP uses the free, keyless `api.country.is` service to determine the visitor country. `CN` selects Simplified Chinese, `JP` selects Japanese, and every other country selects English. Cloudflare's request country is used as a fallback when the lookup service is unavailable. A manual selection is stored in local storage and the `rp_l` cookie. Per-media `rp_p_*` cookies store every audio/video path and playback position on that device; completed media remains recorded at its full duration.

## Deploy

```bash
You don't need to change Cloudflared's build command.

If you want to run it locally,please run Local.cmd
```
