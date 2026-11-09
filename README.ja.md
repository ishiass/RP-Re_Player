<p align="center">
  <img src="public/favicon.svg" width="120" alt="Re Player logo" />
</p>

<div align="center">

# 🎬 Re Player (RP)

**Astro + Cloudflare Workers で作られたリンク型メディアライブラリ**

[English](README.md) · [简体中文](README.zh-CN.md) · 日本語

[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-7-orange)](https://astro.build)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)

</div>

---

## 📝 プロジェクト概要

Re Player は**リンク型メディアライブラリ**です。管理者が外部の動画・音声・画像を仮想 `/root` ディレクトリにマウントし、訪問者は左側でツリーを閲覧しながら、右側のブラウザプレイヤーで再生します。外部ストレージを直接マウントする必要はありません。プロジェクトは **Astro + Cloudflare Workers** 上で動作し、専用サーバーは不要です。

**リポジトリ**: [github.com/lircia/RP-Re_Player](https://github.com/lircia/RP-Re_Player)

> [!NOTE]
> 本プロジェクトは **MIT** ライセンスで公開されています。自由に利用・変更・再配布できます。
>
> 本プロジェクトには Apache License 2.0 で提供される `movi-player` 0.4.1 と、そのライセンスに記載されたサードパーティコンポーネントが含まれます。詳しくは [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) と同梱の [movi-player ライセンス本文](THIRD-PARTY-NOTICES) を参照してください。

## 🚀 クイックスタート

### 必要環境

- **Node.js ≥ 22**（Astro 7 の要件）
- **npm** または **pnpm**

### ローカル実行

> [!NOTE]
> メインリポジトリの `Local.cmd` によるローカル実行機能は不完全で、実行しているコンピューターからのみアクセスできます。LAN 内の別のデバイスからアクセスする場合は、リリースパッケージをダウンロードして同梱の README を参照してください。

```bash
npm install
npm run local
```

デフォルトでは HTTP を使用し、`http://127.0.0.1:12067` で待ち受けます。必要に応じて `RP_HTTP_PORT` でポートを変更できます。Debian/Linux では Wrangler の対話型開発 UI を無効にします。

既定の管理者パスワードは `masteradmin` です。`/admin` を手動で開いてログインしてください。環境変数 `P` を設定するとパスワードを変更できます。

### Cloudflare Workers へのデプロイ

```bash
npm run cf:deploy
```

Cloudflare のビルドコマンドを変更する必要はありません。

## ✨ 主な機能

- **🎞️ マルチフォーマット再生** — 動画・音声・画像をひとつのプレイヤーで
- **🗂️ リンク型疑似マウント** — 固定 `/root` 配下に任意の外部メディア URL をマウント
- **📝 ASS 字幕** — JASSUB/libass によるブラウザ内描画、SC/JP フォントのフォールバック付き
- **🎤 LRC 歌詞** — リアルタイム同期・ハイライト、二言語歌詞に対応
- **🌍 自動言語** — IP に基づく英語・中国語・日本語の自動選択と手動変更
- **📊 訪問者統計** — `/table` で訪問・ディレクトリ・メディア・再生イベントを確認
- **🌗 5 つのテーマ** — デフォルト・レトロ・アズール・ニューブルー・ライトグレーを一括切替
- **🔒 パスワード保護** — `/admin` と `/table` はどちらも管理者パスワードが必要
- **💾 D1 永続化** — D1 がない場合はメモリ内フォールバック
- **📈 Umami 分析** — オプションの [Umami](https://umami.is) 統合

## 🌐 公開ルート

| ルート | 説明 |
| --- | --- |
| `/` | 入場アニメーション。モバイル端末では `/Local` へ移動 |
| `/Re` | 入場アニメーションページ（外部 intro メディア後、`/Loading` へ） |
| `/Loading` | 言語を選択して `Start` で訪問者ページへ |
| `/Local` | 通常の訪問者メディアライブラリ |
| `/Local/Pash/...` | 通常の疑似マウント表示 URL |
| `/Tree/...` | `/root/tree` にマウントされたメディアのネイティブプレイヤー |
| `/table` | 訪問者統計ページ（管理者パスワードが必要） |
| `/admin` | 管理コンソール（疑似マウント・テーマ・設定） |

`Tree` は `Local` と同じ階層にありますが、通常の Local リストには表示されません。管理コンソールでフォルダーを `/tree` として登録してください。

## ☁️ Cloudflare D1

プロジェクトはすでに `wrangler.toml` で D1 バインディングを有効にしています。別の Cloudflare アカウントへ移行する場合は、D1 データベースを作成し、`database_name` と `database_id` を置き換えてください。

```toml
[[d1_databases]]
binding = "D1"
database_name = "your-database-name"
database_id = "your-cloudflare-d1-database-id"
```

RP は以下のテーブルを自動的に作成・更新します。

| テーブル | 用途 |
| --- | --- |
| `rp_pseudo_links` | 疑似マウント情報 |
| `rp_media_visitors` | 訪問者ごとの再生進捗と完走統計 |
| `rp_visitor_events` | 訪問・ディレクトリ・メディア・再生イベント |
| `rp_settings` | 保存された環境変数 |
| `rp_visitor_theme` | 公開ページの訪問者テーマ |

D1 バインディング名は `D1` のままでなければなりません。また、Cloudflare 環境で `KV` という名前の KV Namespace バインディングを設定してください。空の KV ID はリポジトリに追加しないでください。

## 🔧 環境変数

| 変数 | 用途 |
| --- | --- |
| `A` | 訪問者ページの前に表示する外部メディア URL |
| `B` | `A` と `C` の最大表示・再生時間（秒）。既定値は `4.2` |
| `C` | `A` と同時に再生する任意の外部音声 URL。設定すると `A` の動画はミュート |
| `N` | サイト名 |
| `P` | 管理者パスワード |
| `WM` | Movi 字幕のサイズ倍率。既定値 `0.78`（有効範囲 `0.1`～`3`） |
| `PBN` | 動画コントロールバーのガラス背景の不透明度。既定値 `0.12`（`0` は透明、`1` は不透明） |
| `DB` | 疑似マウントと訪問者テーマの保存先。`d1` または `kv`。既定値は `d1` |
| `D1` | D1 バインディング。再生統計、訪問記録、設定、KV のバックアップに使用 |
| `US` | Umami スクリプト URL |
| `UI` | Umami ウェブサイト ID |
| `UH` | 任意の Umami ホスト URL |
| `UD` | 任意の Umami ドメイン一覧 |

D1 が利用できる場合、RP は `env:変数名` キーがまだないときに、空でない `A`、`B`、`C`、`N`、`P`、`US`、`UI`、`UH`、`UD` の各バインディングを `rp_settings` に保存します。以降のデプロイでは保存値が優先されます。`WM` と `PBN` は実行環境から直接読み取り、D1 には保存しないため、保存済み設定に上書きされずに変更できます。`keep_vars = true` は Cloudflare ダッシュボードで設定した変数が Wrangler に削除されるのを防ぎます。

`DB` が `kv` で、`KV` バインディングが存在する場合に限り、疑似マウントリンクと訪問者テーマに KV を使用します。KV が未設定の場合や `DB` がその他の値の場合は D1 に自動的に戻ります。再生進捗、統計、訪問記録、設定、移行状態は引き続き D1 に保存されます。KV モードでもマウントの追加・削除とテーマ変更を D1 にバックアップします。KV の初期化マーカーがない場合、D1 のバックアップから KV を再構築します。

## 📖 詳細

### ASS 字幕

動画を追加するときに、公開 HTTP(S) の `.ass` 字幕 URL を指定できます。RP はサイト内の字幕エンドポイント経由で字幕を取得し、通常のブラウザ CORS 制限を回避します。プレイヤーは字幕が実際に使う文字に対応した小さな Noto Sans サブセットを要求し、フォントサービスが利用できない場合は同梱の SC/JP フォントをフォールバックします。字幕の取得元は Cloudflare Workers から到達可能である必要があります。

外部字幕のない MKV 動画は、既定では最初の埋め込み ASS トラックだけを読み込みます。管理コンソールの項目は **H5 で再生困難** に変更され、有効にした動画だけ [movi-player](https://github.com/MrUjjwalG/movi-player) でブラウザ内処理します。Matroska の埋め込み字幕トラックを選択でき、無効の動画は従来の HTML5/JASSUB 処理を使います。Movi 側の外部 ASS はブラウザ互換の WebVTT に変換され、完全な ASS スタイルは従来の分岐で利用できます。Movi は HTTP Range による段階読み込みを使うため、メディアプロキシは上流の `206 Partial Content` をそのまま返し、メディアエンドポイントのキャッシュを無効にします。詳しくは Cloudflare の [Range リクエスト動作](https://developers.cloudflare.com/cache/reference/range-requests/) と [Workers Cache の制限](https://developers.cloudflare.com/workers/cache/limitations/) を参照してください。Workers Cache は Worker が直接返す `206` を保存しないため、キャッシュ目的で `200` に強制変換しないでください。

`WM` で Movi 字幕のサイズ倍率を変更できます（既定値 `0.78`、有効範囲 `0.1`～`3`）。`PBN` では動画コントロールバーのガラス背景の不透明度を変更できます（既定値 `0.12`。`0` は透明、`1` は不透明）。

### LRC 歌詞

音声を追加するときに、同期歌詞用の公開 HTTP(S) `.lrc` URL を指定できます。**二言語歌詞** を有効にすると、別言語の歌詞ファイルも追加できます。RP は両ファイルをサイト内プロキシ経由で取得して CORS 制限を回避し、現在行をリアルタイムにハイライト・スクロールします。中国語の歌詞を検出した場合は中国語が上、外国語が下に表示されます。言語判定ができない場合は、別言語のファイルが既定ファイルの上に表示されます。同じタイムスタンプに 2 行含まれる単一 LRC は自動的に調整されます。

### 自動言語

手動の言語設定が保存されていない場合、RP は無料で鍵不要の `api.country.is` サービスで訪問者の国を判定します。`CN` は簡体字中国語、`JP` は日本語、それ以外は英語になります。サービスが利用できない場合は Cloudflare のリクエスト国情報をフォールバックとして使用します。手動選択はローカルストレージと `rp_l` Cookie に保存されます。メディアごとの `rp_p_*` Cookie は、そのデバイスのすべての音声/動画パスと再生位置を保存し、完走したメディアは完全な長さで記録されます。

## 📁 ディレクトリ構造

```
RP-Re_Player
├── src/                        # ソースコード
│   ├── layouts/                # ページレイアウト
│   ├── lib/                    # ビジネスロジック（疑似マウント・字幕・歌詞・テーマ等）
│   ├── pages/                  # ルートページ
│   │   ├── api/                # API エンドポイント
│   │   │   ├── admin/          # 管理 API
│   │   │   └── public/         # 訪問者向け公開 API
│   │   ├── Local/              # 訪問者メディアライブラリ
│   │   └── tree/               # ネイティブプレイヤー
│   ├── styles/                 # グローバル・テーマスタイル
│   └── types/                  # 型定義
├── public/                     # 静的アセット（フォント・アイコン・ポスター）
├── scripts/                    # ビルド・ローカル実行スクリプト
├── astro.config.mjs            # Astro 設定
├── wrangler.toml               # Cloudflare 設定
├── package.json                # 依存関係
└── LICENSE                     # MIT ライセンス
```

## 🙏 謝辞

- [Astro](https://astro.build) — Web フレームワーク
- [JASSUB](https://github.com/ThaUnknown/jassub) / [libass](https://github.com/libass/libass) — ASS 字幕描画
- [movi-player](https://github.com/MrUjjwalG/movi-player) — メディアプレイヤー
- [Umami](https://umami.is) — オプションのサイト分析

## ⚖️ ライセンス

Re Player 独自のソースコードは [MIT License](LICENSE) で提供されます。サードパーティ依存関係はそれぞれのライセンスに従います。`movi-player` 0.4.1 は Apache License 2.0 です。ビルド成果物を再配布する前に [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) を確認してください。
