# README_AI — AI開発基盤 v1 の入口

このリポジトリでの **Claude × Codex 併用開発基盤（v1）** の入口ドキュメント。
「今どこまで出来ているか」「何をすれば動くか」「料金・停止・普段の操作」をここで把握する。

- 役割分担と安全ルール：[`CLAUDE.md`](../CLAUDE.md)
- 自動化の全体設計：[`ai-development-workflow.md`](./ai-development-workflow.md)
- 運用マニュアル（料金/停止/トラブル）：[`ai-development-ops-manual.md`](./ai-development-ops-manual.md)
- Codex 手動運用ガイド：[`codex-operations.md`](./codex-operations.md)
- 実装AI向け方針：[`AGENTS.md`](../AGENTS.md)

---

## ひとことで

**人が GitHub Issue を1つ作り、ラベルを付ける → Claude が設計、Codex が実装、人が Merge。**
すべての履歴は GitHub の Issue/PR に残る。AI は `main` に直接触らない。

---

## ✅ 完成済み（v1 として出来ていること）

| 項目 | 実体 | 状態 |
|---|---|---|
| 役割分担ルール | `CLAUDE.md` | ✅ main 反映済み |
| 自動化の全体設計 | `docs/ai-development-workflow.md` | ✅ |
| 運用マニュアル | `docs/ai-development-ops-manual.md` | ✅ |
| Codex 運用ガイド | `docs/codex-operations.md` | ✅ |
| 実装AI向け方針 | `AGENTS.md`（Codex制約を追記済み） | ✅ |
| Claude ワークフロー | `.github/workflows/claude.yml`（plan / review / @claude） | ✅ ファイルは main にある |
| ラベル | `claude:plan` / `codex:implement` / `claude:review` / `codex:fix` | ✅ 作成済み |
| Issue 機能 | fork で有効化 | ✅ |
| `gh` デフォルト | `beckhamichan/line-harness-oss`（fork）に固定 | ✅ |
| テスト用 Issue | [#3 AI開発フローの初回テスト](https://github.com/beckhamichan/line-harness-oss/issues/3) | ✅ 作成済み（未起動） |

→ **「設計図・ルール・部品」はすべて揃っている**。あとは認証を繋げば動く状態。

## ⬜ 未完成（動かすために残っている設定 / すべて GitHub UI 操作）

| # | やること | 場所 | 目的 |
|---|---|---|---|
| 1 | GitHub Actions を有効化 | Settings → Actions → General | ワークフロー実行を許可 |
| 2 | Workflow permissions を Read and write に | Settings → Actions → General | Claude がコメントできるように |
| 3 | `CLAUDE_CODE_OAUTH_TOKEN` を登録 | Settings → Secrets and variables → Actions | Claude の認証（これが無いと動かない） |
| 4 | Codex GitHub App をインストール | github.com の Codex 連携 | Codex（実装担当）を有効化 |
| 5 | 初回動作確認 | Issue #3 に `claude:plan` を付ける | Claude が設計コメントを返すか確認 |

> 1〜3 が終われば Claude の plan テストが可能。4 は Codex を使う段階で必要。

## 🔮 将来追加予定（v2 以降のロードマップ）

| フェーズ | 内容 | 何が良くなるか |
|---|---|---|
| CI 自動化 | `GH_PAT`（or GitHub App トークン）導入 | AI生成PRで `worker-ci` が自動発火（手動確認が不要に） |
| トリガ簡素化 | `claude:plan`→`codex:implement` の自動連鎖 | 人の操作が「Issue作成」と「Merge」だけに |
| 品質ゲート強化 | `main` に Branch protection（CI緑＋レビュー必須） | 事故をルールで防ぐ |
| 条件付きオートマージ | `docs:` 等の低リスクPRのみ自動マージ | 雑務の自動化 |
| 監視・通知 | 失敗/異常配信を Discord 等へ通知 | 無人運転の安全網 |

> 原則：自動化を進めても **配信安全(21:00〜8:00)・二重送信・秘密情報に触るPRは最後まで人間が承認**する。

## 🚫 現時点では不要（あえて入れていないもの）

| 項目 | 不要な理由 |
|---|---|
| `OPENAI_API_KEY` | Codex は方式A（GitHub App / web / app）の手動運用。従量課金の青天井を避ける |
| Codex 用ワークフロー（`codex.yml`） | 方式Aなので不要 |
| `ANTHROPIC_API_KEY` | Claude は OAuth トークン方式。従量課金にしない |
| `GH_PAT` | 当面は CI を手動確認で回す（v2 で導入検討） |
| `.github/PULL_REQUEST_TEMPLATE/codex-task.md` | 既存の既定 PR テンプレで十分。複数テンプレ化の弊害を回避 |

---

## 💰 料金が発生する可能性がある箇所

> 数値は2026年6月時点の概算。最新は各サービスの料金ページで要確認。

| 箇所 | 課金の起き方 | v1 での扱い |
|---|---|---|
| Claude（OAuthトークン） | Claudeサブスク枠を消費。超過は追加課金でなくレート制限 | **既存サブスク内**。新規固定費なし |
| Codex（GitHub App / web） | ChatGPT/Codexサブスク枠を消費 | **既存サブスク内**。新規固定費なし |
| GitHub Actions | public リポジトリは無料・無制限 | **¥0** |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | 使うほど従量課金 | **入れていない**ので発生しない |
| Cloudflare デプロイ | 各無料枠超過で課金（AI基盤とは別軸の既存コスト） | 既存のまま |

→ **新たな従量課金キーを入れない限り、AI開発基盤として増える固定費は実質ゼロ**。

## 🛑 停止方法（軽い順）

1. **ラベルを付けない** … 起動はラベル/メンション駆動。付けなければ何も動かない。
2. **ワークフロー無効化** … Actions → 「Claude」→ Disable workflow。
3. **Codex を止める** … アサインを外す／`@codex` を使わない。完全停止は Codex App アンインストール。
4. **トークン削除** … `CLAUDE_CODE_OAUTH_TOKEN` を消すと Claude は動かない。
5. **Actions 全停止** … Settings → Actions → Disable。
6. **完全撤去** … `.github/workflows/claude.yml` を削除する PR を Merge。

> 緊急時の最短：**Actions を Disable** か **トークン削除**。これで AI 起動は即止まる。

---

## 🙋 私（人）が普段やる操作

これだけ。設計・実装・テスト・修正・レビューは AI が分担する。

1. **Issue を1つ作る**（やりたいこと・背景を書く）。
2. `claude:plan` を付ける → Claude が設計・受け入れ条件・分解をコメント。
3. 内容を確認。OK なら `codex:implement` を付ける → Codex が実装して PR を作成。
4. **CI を手動確認**（Actions → Worker CI → Run workflow、当面は手動）。
5. PR に `claude:review` を付ける → Claude がレビュー。
6. 指摘があれば PR に `@codex fix`。4〜6 を必要回数ループ。
7. **最終確認して Merge** → `main` → Cloudflare へデプロイ。

> 握るのは「Issue作成」「ラベル付け」「最後の Merge」。最後の砦は常に人。
