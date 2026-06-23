# Project Instructions

- ゴールから外れる提案をしないでください。
- ゴールに進む提案を必ずしてください。
- 回答には必ず「次のタスクはこれ」「今の進捗を全体像から整理するとこれ」を含めてください。
- 私が大学生だと思って、言語化してください。

---

## Codex の役割と制約（実装担当）

- あなた（Codex）は **実装・テスト作成・バグ修正**を担当します。設計やスコープ判断はしません（それは Claude / 人の役割）。
- 作業は **Claude の plan（受け入れ条件・タスク分解）が確定した後だけ** 始めます。
- **`main` へ直接 push しない。** 必ずブランチを切り、PR を作って `.github/PULL_REQUEST_TEMPLATE.md` を埋め、Issue 番号を紐付けます。
- 実装したら **vitest を書き／更新**し、`pnpm --filter <pkg> typecheck` と `test` を通してから PR を出します。
- 安全制約（最優先・絶対）:
  - 配信禁止帯 **JST 21:00〜翌8:00** は配信しない（`packages/db/src/scenario-schedule.ts` の `clampToDeliveryWindow` を必ず経由）。
  - 二重送信・誤アカウント送信・大量誤送信を生まない。
  - トークン・チャネルシークレット・アカウントID・顧客データを差分や PR に含めない。
- 詳細は `CLAUDE.md` と `docs/codex-operations.md` に従います。
