# Codex 運用ガイド（実装担当）

Codex を「実装・テスト・修正」担当として、**手動起動・低コスト・履歴を残す**形で運用するためのガイド。
役割分担の全体像は [`CLAUDE.md`](../CLAUDE.md)、自動化設計は
[`ai-development-workflow.md`](./ai-development-workflow.md)、運用全体は
[`ai-development-ops-manual.md`](./ai-development-ops-manual.md) を参照。

## 基本方針

- Codex は **実装・テスト作成・バグ修正**のみを担当する。設計・スコープ判断はしない（Claude/人の領域）。
- **当面は手動起動**。Codex GitHub Action や `OPENAI_API_KEY` は導入しない。
- 起動は **Claude の plan が確定した後だけ**（`codex:implement` が付いた Issue）。
- すべての作業は **GitHub の Issue/PR に履歴を残す**。

## 起動方式（手動運用前提）

次のいずれかで、人が明示的に起動する。自動実行はしない。

- **Codex GitHub App**：対象 Issue を Codex にアサイン、または Issue/PR に `@codex` でタスクを渡す。
- **Codex web（ChatGPT/Codex）**：ブラウザでリポジトリを接続し、Issue内容を貼って実装させ、PRを作らせる。
- **Codex app（デスクトップ/CLIなど）**：手元で起動し、対象ブランチに実装してPRを出す。

いずれの方式でも、**入力は「Claudeがplanで書いた受け入れ条件・タスク分解」**を起点にする。

## 費用リスクを抑えるルール

- `OPENAI_API_KEY` を**登録しない**（従量課金の青天井を避ける）。
- Codex は **ChatGPT/Codex サブスクの枠内**で使う。枠を超えたら止める（追加課金を即発生させない）。
- 1回のタスクは**小さく**保つ（大きな実装は Claude に分解し直してもらう）。
- 常時起動・自動ループはしない。**人が必要なときだけ**手で動かす。

## 標準フロー

1. Issue に Claude の plan（受け入れ条件・分解）が付いている事を確認。
2. Issue に `codex:implement` を付け、Codex を手動起動。
3. Codex は **ブランチを切って**実装する（`main` には絶対 push しない）。
4. Codex は **vitest を書き／更新**し、`pnpm --filter <pkg> typecheck` と `test` をローカルで通す。
5. Codex は **PR を作成**し、既存の `.github/PULL_REQUEST_TEMPLATE.md` を埋める。Issue 番号を紐付ける（`Fixes #NN`）。
6. CI（worker-ci）を手動確認（`GH_PAT` 未導入のため自動発火しない）。
7. PR に `claude:review` を付け、Claude のレビューを受ける。
8. 指摘があれば PR に `@codex fix` で修正を push。6〜8 を必要回数ループ。
9. 人が最終確認して Merge。

## Codex がやること

- 受け入れ条件を満たす最小の実装。
- テストの作成・更新（特に配信ロジックを触る場合）。
- typecheck / test をローカルで通してから PR を出す。
- PR テンプレートの Verification / Security Impact / Safety Checklist を正直に埋める。

## Codex がやってはいけないこと

- `main` への直接 push・直接コミット。
- 設計変更・スコープ拡大（plan外のことをやる）。
- **配信禁止帯 JST 21:00〜翌8:00 の無視**（`packages/db/src/scenario-schedule.ts` の `clampToDeliveryWindow` を必ず経由）。
- 二重送信・誤アカウント送信・大量誤送信を生む変更。
- トークン・チャネルシークレット・アカウントID・顧客データを差分やPRに含めること。

## 止め方

- `codex:implement` / `@codex` を使わない（起動しないだけで停止）。
- Codex GitHub App をアンインストールすれば完全に止まる。
- API キーは入れていないので、従量課金が勝手に走ることはない。

## 関連

- 役割分担と安全ルール：[`CLAUDE.md`](../CLAUDE.md)
- 実装AI向け方針：[`AGENTS.md`](../AGENTS.md)
- PRテンプレート：[`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md)
