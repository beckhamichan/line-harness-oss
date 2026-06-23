# CLAUDE.md — Claude Code 用 開発ガイド

このファイルは Claude Code 向けの指示です。実装 AI（Codex）向けの安全基準は
`AGENTS.md` を正とし、本ファイルから上書きしません。

---

## 0. AGENTS.md と共通の大原則（必ず守る）

`AGENTS.md` に書かれた以下は Claude も同じく守ります。

- ゴールから外れる提案をしない。ゴールに進む提案を必ずする。
- 回答には必ず **「次のタスクはこれ」** と **「今の進捗を全体像から整理するとこれ」** を含める。
- 大学生に説明するつもりで言語化する（専門用語は補足する）。

---

## 1. Claude と Codex の役割分担

GitHub Issue/PR を中心に、履歴が残る形で開発する。基本フローは
**Issue（設計・分解）→ ブランチ → 実装 → PR → レビュー → マージ**。

| フェーズ | 担当 | 具体的にやること |
|---|---|---|
| 設計・要件整理 | **Claude** | Issue を読み、ゴール・非ゴール・受け入れ条件を言語化 |
| タスク分解 | **Claude** | 大きな作業を小さな PR 単位に割る。依存関係・順番を示す |
| 実装 | **Codex** | 分解されたタスクをコード化する |
| テスト作成・実行 | **Codex** | vitest を書き、`pnpm --filter <pkg> test` を通す |
| バグ修正 | **Codex** | 失敗テスト・CIログを起点に直す |
| コードレビュー | **Claude** | PR の差分をレビューし、安全性・設計の観点で指摘 |

要するに **Claude = 考える/分解する/レビューする、Codex = 書く/テストする/直す**。
Claude は原則コードを直接書かず、「何を・どの順で・なぜ作るか」を Issue/PR コメントに残す。
（小さな自明な修正まで禁止するわけではないが、迷ったら Codex に渡す。）

---

## 2. GitHub Issue / PR 中心の運用ルール

履歴がリポジトリに残ることを最優先する。

- **作業前に Issue を立てる**（または既存 Issue を選ぶ）。大きな機能はコードより先に Issue で合意する。
- 1 Issue = 1 つの目的。**小さく・レビュー可能な PR** を好む（`CONTRIBUTING.md` の方針に従う）。
- ブランチ運用:
  - `main` へ直接コミット・直接 push しない。必ずブランチを切る。
  - ブランチ名は目的が分かる形にする（例: `feat/...`, `fix/...`, `docs/...`）。
- コミットメッセージは **Conventional Commits** に合わせる
  （`feat:` / `fix:` / `docs:` / `chore:` / `test:` など。既存ログがこの形式）。
- PR には Issue 番号を紐付け、`.github/PULL_REQUEST_TEMPLATE.md` を埋める。
- Claude は PR をレビューする際、後述「安全性チェック」を必ず通す。

### リポジトリ構成（重要）

- `origin` = `beckhamichan/line-harness-oss`（自分の fork）
- `upstream` = `Shudesu/line-harness-oss`（本家 OSS）
- 本家は「公開 OSS の入口」、本番は別の private リポジトリ。
  つまり **公開 PR がそのまま本番デプロイになるわけではない**（`CONTRIBUTING.md` 参照）。
- `gh` のデフォルト解決先がどちらかを取り違えないこと（Issue/PR 一覧の出所に注意）。

---

## 3. beナビCRM 向け 開発ルール

このリポジトリは LINE 公式アカウントの CRM/配信基盤（beナビCRM のベース）。
**実運用ユーザー・LINE アカウント・認証情報・顧客データを壊さない**ことを最優先する。

### 3-1. 配信の安全性（最重要・絶対）

- **配信禁止時間帯: `Asia/Tokyo` 基準の 21:00 以上、翌 8:00 未満は配信しない。**
  - broadcast、multicast、push、シナリオ、リマインダー、予約通知、automation、
    テスト送信など、利用者への能動的な LINE 送信を対象とする。
  - 受信イベントと同じ処理内で reply token を使う即時 reply だけを例外とする。
    それ以外の例外は設けない。
  - 実装は `packages/db/src/scenario-schedule.ts` の `clampToDeliveryWindow()`
    （`QUIET_START_HOUR = 21` / `QUIET_END_HOUR = 8`）。
  - 配信時刻を計算するコードを触るときは、必ずこのガードを経由させる。
    新しい配信経路を足す場合も同じ禁止帯を適用し、境界テストを追加する。
  - 関連テスト: `packages/db/src/scenario-schedule.test.ts`。仕様を変えるならテストも更新する。
- 二重送信・誤アカウント送信・大量誤送信を生む変更は最優先で避ける/レビューで止める。
- レビュー優先度は `CONTRIBUTING.md` の順（1. セキュリティ → 2. データ損失/二重送信/誤アカウント/配信安全 → …）に従う。

### 3-2. 秘密情報

- トークン・チャネルシークレット・アカウントID・webhook URL・友だちID・顧客データ・本番エクスポートを
  コード・コミット・PR・Issue に**絶対に含めない**。
- ログや再現手順を貼るときも上記をマスクする。

---

## 4. 技術スタックと基本コマンド

- **pnpm モノレポ**（`pnpm@9.15.4` / Node ≥20）
- **Cloudflare**: Workers + Pages + D1、`wrangler` v4
- **TypeScript** 5.9 / テスト **vitest** 2.1
- 主な構成:
  - `apps/` → `worker`（API/配信ロジック）, `web`（管理画面）, `liff`（LINE LIFF）
  - `packages/` → `db`, `line-sdk`, `shared`, `update-engine`, `mcp-server`, `create-line-harness` ほか

よく使うコマンド（`package.json` の scripts より）:

```bash
pnpm install --frozen-lockfile      # 依存インストール
pnpm dev:worker                     # worker をローカル起動
pnpm dev:web                        # 管理画面をローカル起動
pnpm --filter worker typecheck      # 型チェック
pnpm --filter worker test           # worker のテスト
pnpm --filter <pkg> test            # 個別パッケージのテスト
pnpm -r build                       # 全パッケージビルド
```

CI（`.github/workflows/worker-ci.yml`）は **typecheck → test → build** を回す。
PR を出す前に、変更パッケージで最低限 typecheck と test を通しておく（Codex 担当）。

---

## 5. 迷ったときの優先順位

1. 配信安全（特に 21:00〜8:00 禁止）と秘密情報保護
2. データを壊さない・二重送信しない
3. 小さくレビュー可能な単位にする
4. ゴールに対して前進する提案をする

迷ったら手を止めて、Issue/PR コメントで論点を言語化してから進める。
