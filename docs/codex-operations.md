# Codex 運用ガイド（実装担当）

Codex を「実装・テスト・修正」担当として、**手動起動・低コスト・履歴を残す**形で運用するためのガイド。
Codex の実装安全基準は [`AGENTS.md`](../AGENTS.md) を正とする。本書は補足の操作手順であり、
`AGENTS.md` と矛盾する場合は `AGENTS.md` を優先して作業を止める。役割分担の全体像は
[`CLAUDE.md`](../CLAUDE.md)、自動化設計は
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

- `OPENAI_API_KEY` を要求・参照・登録・使用しない（従量課金の青天井を避ける）。
- Codex は **ChatGPT/Codex サブスクの枠内**で使う。枠を超えたら止める（追加課金を即発生させない）。
- 1回のタスクは**小さく**保つ（大きな実装は Claude に分解し直してもらう）。
- 常時起動・自動ループはしない。**人が必要なときだけ**手で動かす。

## 標準フロー

1. Issue に Claude の plan（受け入れ条件・分解）が付いている事を確認。
2. 人が plan を承認し、Issue に `codex:implement` を付けて Codex を手動起動。
3. Codex は `AGENTS.md` の実装開始前チェックリストを確認する。不足があれば開始しない。
4. Codex は **ブランチを切って**実装する（`main` には直接 commit / push しない）。
5. Codex は変更に応じて vitest を書き／更新し、`typecheck`、`test`、`build` を実行する。
   外部送信や本番接続は mock 化する。
6. Codex は **PR を作成**し、既存の `.github/PULL_REQUEST_TEMPLATE.md` を埋める。
   Issue 番号を紐付ける（`Fixes #NN`）。
7. 人が CI（worker-ci）を手動確認する（`GH_PAT` 未導入のため自動発火しない）。
8. PR に `claude:review` を付け、Claude のレビューを受ける。
9. 指摘があれば PR に `@codex fix` で修正を push。7〜9 を必要回数ループ。
10. 人が最終確認して merge。Codex は merge しない。

## 人の明示的承認が必要な操作

- Cloudflare への deploy。
- GitHub Actions の `workflow_dispatch`。
- remote D1 への query、migration、書き込み、削除。
- LINE API による実送信（テスト送信を含む）。
- 有料 API、外部課金操作、本番・ステージング環境への接続や設定変更。

承認がない場合は実行せず、mock、fixture、ローカル D1 で検証する。
人の承認があっても、配信禁止時間帯を上書きすることはできない。

## Codex がやること

- 受け入れ条件を満たす最小の実装。
- テストの作成・更新（特に配信ロジックを触る場合）。
- typecheck / test / build を変更範囲に応じてローカルで通してから PR を出す。
- PR テンプレートの Verification / Security Impact / Safety Checklist を正直に埋める。

## Codex がやってはいけないこと

- `main` への直接 push・直接 commit・force-push。
- PR の merge、release、tag 作成。
- 設計変更・スコープ拡大（plan外のことをやる）。
- `OPENAI_API_KEY` の要求・参照・登録・使用。
- 人の承認が必要な操作を、承認なしで実行すること。
- 二重送信・誤アカウント送信・大量誤送信を生む変更。
- トークン・チャネルシークレット・アカウントID・顧客データを差分やPRに含めること。

## 配信禁止時間帯の適用範囲

- 禁止時間帯は **`Asia/Tokyo` 基準の 21:00 以上、翌 8:00 未満**。
- broadcast、multicast、push、シナリオ、リマインダー、予約通知、automation、
  テスト送信などの能動的な LINE 送信が対象。
- 受信イベントと同じ処理内で reply token を使う即時 reply だけが例外。
- 人の承認があっても、それ以外の例外は設けない。
- 配信経路を変更するときは `clampToDeliveryWindow()` または同等のガードを適用し、
  21:00、23:59、0:00、7:59、8:00 の境界テストを追加する。

## 止め方

- `codex:implement` / `@codex` を使わない（起動しないだけで停止）。
- Codex GitHub App をアンインストールすれば完全に止まる。
- API キーは入れていないので、従量課金が勝手に走ることはない。

## 関連

- 役割分担と安全ルール：[`CLAUDE.md`](../CLAUDE.md)
- 実装AI向け方針：[`AGENTS.md`](../AGENTS.md)
- PRテンプレート：[`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md)
