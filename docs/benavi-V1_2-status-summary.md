# be Navigator CRM V1.2 到達点サマリー（2026-06-27・引き継ぎ用）

> 本ファイルは「私（オーナー）＋次回 AI 開発セッション」向けの引き継ぎ資料。情報量を落とさず維持する。
> 文脈：Hub（`?page=hub`）で目的を選ぶ → ルートタグ（R:）付与 → そのルートのオンボーディングが tag_added で自動開始、というマルチルート CRM の「各ルートの中身」を整備するフェーズ。

---

# ① オーナー向けサマリー

## 今回完成したこと
- **教育型ルートを 2 本、本番化（循環器・心臓デバイス・心不全のうち device/hf を新規本番化、circ は前段で本番化済）** → 教育型は **4 ルート稼働**に。
- **7 日オンボの共通テンプレート化**：変えるのは実質 **Day3（ミニ講義）と Day5（コンテンツ紹介）の 2 枠だけ**。
- **AI 活用ルートの本文確定**（本番化は保留）。
- **フィード型（文房具・イベント）の設計確定**：7 日型とは別構造（導入＋お知らせ配信の 2 層）＋運用原則「価値提供 8：告知 2」。
- **ドキュメント正本を main に集約**（PR #14/#15/#16 すべて merge 済）＝ main が本番実態と一致。

## 本番稼働中のルート（4 本）
| ルート | 形式 | 状態 |
|---|---|---|
| 心電図（ecg） | 7 日教育型（診断分岐あり） | 稼働中（看板・V1.0 から） |
| 循環器（circ） | 7 日教育型 | 稼働中（本番化・実機 E2E 済） |
| 心臓デバイス（device） | 7 日教育型 | 稼働中（本番化・実機 E2E 済） |
| 心不全（hf） | 7 日教育型 | 稼働中（本番化・実機 E2E 済） |

- 動作：Hub で選ぶ → 初日に「ようこそ（Day0）」→ 以後 Day1/2/3/5/6/7 が毎日 1 通。
- 守られている安全ルール：**夜 21 時〜朝 8 時は配信しない**／**1 回の選択で 2 通ダブらせない（T1）**。

## 設計済み・未稼働のルート（3 本）
| ルート | 形式 | できているところ | 残り |
|---|---|---|---|
| AI 活用（ai） | 7 日教育型 | 本文確定 | スイッチを入れる作業（本番化）|
| 文房具（goods） | フィード型 | 設計＋導入文確定 | 本番化＋お知らせ配信運用 |
| イベント（event） | フィード型 | 設計＋導入文確定 | 本番化＋イベント都度配信運用 |

## CRM としてできるようになったこと
- **興味タグ（R:）で人を分類し、ルートごとに自動でメッセージを届ける**マルチルート運用が、4 ルートで実運用化。
- **新ルートの量産が高速化**（テンプレの Day3/Day5 を差し替えるだけ）。
- フィード型（商品・イベントのお知らせ）を、しつこくならない原則（価値 8：告知 2）付きで設計済。
- すべての変更が **GitHub の履歴に残り、main＝本番実態**で追える状態。

## 次回、最初にやること（推奨）
1. **AI ルートを本番化**（本文は完成済 → 一連の本番化作業を回すだけ）＝教育型 5 本目。最短・低リスク。
2. その後 **文房具・イベントの本番化＋お知らせ配信の運用開始**。

## 判断が必要なこと（オーナー Go 待ち）
- **AI / goods / event を本番化していくか・順番**（設計は完了済み、あとは実施判断）。
- **Phase C＝「友だち追加だけで自動的にルートに乗せる」本番導線（friend_add 化）に進むか**。**高リスク**（誤配信・全員巻き込み）。主要ルートが揃ってからの最終 Go 案件。現状は入口（hub-entry）は手動（manual）のまま安全側。
- お知らせ配信（broadcast）の実運用を誰がどの頻度で回すか（運用体制）。

---

# ② 開発者向けサマリー

## main HEAD
- `98e4649`（PR #16 squash merge）。local = origin/main、**0/0・working tree clean**。
- リポ：`/Users/manokouji/be Navigator/line-harness-oss`（origin=`beckhamichan/line-harness-oss`、upstream=`Shudesu/line-harness-oss`＝誤爆注意。PR/Issue の解決先に注意）。

## deploy Version
- live worker = **`a1a148de-cad3-4cea-b550-f39eef014216`**（T1＝route-select 二重メッセージ対策 反映済。旧 `e0141a92`）。
- deploy コマンド：`pnpm --filter worker run deploy`（`pnpm deploy` は組込と衝突で不可）。**main から実施**（本番化セッションで実証）。🔴 deploy はオーナー Go 案件。

## D1 状態（line-harness・remote）
- tag_added active scenario = **ecg / circ / device / hf の 4 本・各 7 steps**。
  - ecg `a8c02e28` / R:心電図 `4cdecec7-c40d-4fb1-b972-8e530dc60111`
  - circ `c0cc3d89-cd8e-4f36-9734-3e291076e3ca` / R:循環器 `c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57`
  - device `f6cac1b4-883d-4cb2-a77f-63f52ba2e14c` / R:デバイス `b33180fd-6e12-40ae-aeb4-5db74d785b6f`
  - hf `010a6844-5eb7-4379-9143-751978fae5bf` / R:心不全 `6db94a31-3e2b-41b2-9d41-85948387cd03`
- 全教育型：`delivery_mode=relative` / delay `0/1440/1440/1440/2880/1440/1440`（Day0/1/2/3/5/6/7）/ 診断分岐は ecg のみ。
- **未投入**：ai（R:AI `d0424f6f-4343-455f-af6a-f2a32b7a4b62`）/ goods（R:文房具 `52799965-061a-4710-8e9c-d0cedac02dc8`）/ event（R:イベント `91733e50-e511-4353-96f5-906c54230f95`）。**UUID 未発番**。
- 直近 backup：`/tmp/benavi/d1_full_20260627-103235.sql`（**揮発注意**・恒久化は別途）。
- active/delivering enrollment：実運用上の値は変動。E2E のテスト enroll はすべて completed 停止済（残 active 0 を確認済）。

## 本番稼働ルート（投入済 SQL・main 上）
- `circ_onboarding.sql` / `device_onboarding.sql` / `hf_onboarding.sql`（各 scenarios1+steps7・**再適用不可＝PK 衝突**）。
- 正本ミラー md（=本番稼働中）：`benavi-onboarding-scenario.md`(ecg) / `benavi-circulation-scenario.md` / `benavi-device-scenario.md` / `benavi-heartfailure-scenario.md`。

## PR 状況
- #14 `docs: circulation onboarding scenario + SQL` … **merged**（circ 本番化記録）。
- #15 `feat: educational onboarding rollout — template + device + hf` … **merged**（テンプレ＋device/hf）。
- #16 `docs: add AI onboarding and feed route playbook` … **merged**（AI 本文＋フィード設計）。
- `docs/v1_2-summary`（本サマリー）… **未 PR**（origin push 済）。main に残すなら squash merge、不要なら破棄可。

## ブランチ状況
- アクティブ作業ブランチ：基本なし（本番化・docs 系は全て merge 済 or 退役）。`docs/v1_2-summary` のみ未マージ。
- 退役削除済：`docs/circ-onboarding-sql`(#14) / `feat/device-hf-onboarding`(#15) / `docs/onboarding-template` / `docs/device-onboarding` / `docs/hf-onboarding` / `docs/ai-feed-docs`(#16) / `docs/ai-onboarding` / `docs/feed-template`。
- 無関係の既存ブランチ（本件外・触らない）：`diag/claude-show-output` / `docs/codex-safety-standards` / `fix/claude-id-token-clean` / `fix/claude-plan-comment` / `restore/oss-only-files` / `sync/20260520-private-to-oss` / `gh-pages`。
- 着手規則：必ず `main` から新ブランチ。`main` へ直 push しない。Conventional Commits。commit 末尾に Co-Authored-By。PR は origin（beckhamichan）宛。

## 未実装項目
- **ai 本番化**：UUID 発番 → `ai_onboarding.sql` 生成（Codex 委譲）→ Claude レビュー → backup → D1 適用 → E2E → docs 本番稼働中化 → PR。
- **goods/event 本番化**：導入ミニシナリオ（goods 3steps / event 2steps）を同フロー。＋ **層 2 broadcast 運用**（goods 新商品フィード、event はイベント都度の scheduled broadcast）。
- **broadcast 運用ガード**：layer2 は `scheduled_at` 手動＝**禁止帯 clamp が効かない** → JST21:00–8:00 に置かない運用ルール（`benavi-feed-template.md` §5）。価値 8：告知 2。tracked-link 計測。
- **Phase C（friend_add 化）**：hub-entry を friend_add トリガーへ。🔴 高リスク・委譲禁止・要オーナー最終 Go。
- フィード型導入シナリオ用 UUID は未発番（本番化時に発番）。

## 次回実装タスク（推奨順・各 🔴 はオーナー Go 必須）
1. **AI ルート本番化**（最短）：
   - 本文 `docs/benavi-ai-scenario.md` 確定済 → 固定 UUID 発番（scenario+7steps）→ md に UUID 追記 → codex-bridge（`~/codex-bridge/scripts/codex-task.sh --write --file …`）で `ai_onboarding.sql` 生成 → Claude レビュー（本文↔md 一致・delay 並び・禁止文 0・SQLite パース）→ 🔴 export backup → 🔴 `wrangler d1 execute line-harness --remote --file ai_onboarding.sql` → 🔴 E2E（テストユーザー：route-select interest=ai → Day0 のみ・intro 抑制）→ enrollment completed 停止 → docs 本番稼働中化 → PR。
2. **goods/event 導入シナリオ本番化**（同フロー）＋ **broadcast 運用開始**（管理画面）。
3. （主要ルート充足後）**Phase C 検討**。

## 開発の作法・知見（再開時に効く）
- **本番化フロー（実証済 3 回）**：本文 FIX → 固定 UUID → Codex で .sql 生成 → Claude レビュー → 事前検証（R:タグ存在 / scenario 未投入）→ D1 export backup → `wrangler d1 execute --remote --file` 適用 → 適用後検証 → テストユーザー E2E（Day0 のみ / intro 抑制）→ enrollment completed 停止 → docs 本番稼働中化 → PR → squash merge。
- **T1 挙動**：route-select は R:タグに active な tag_added シナリオがあると intro Push を抑制（Day0 が歓迎を兼ねる）。ecg は診断ブリッジ intro を維持（特例）。実装 `apps/worker/src/routes/liff.ts` `hasActiveTagAddedScenario` / `route-select`。
- **テストユーザー（E2E 用）**：friend.id `99ca91bf-4388-4b96-94fc-ece250d46858`（Koji Mano）。R:心電図/循環器/デバイス/心不全 タグ＋各 completed enrollment 保持。**再 E2E 時は対象シナリオの過去 enrollment を要 DELETE**（`attachTagAndFireSideEffects` は status を問わず既存 enrollment があると enroll をスキップ）。**lineUserId は秘密＝ログに出さない**。
- **委譲**：実装/SQL 生成は Codex（codex-bridge `--write`）→ Claude レビュー必須。
- **高リスク（要オーナー Go・委譲禁止）**：deploy / friend_add 化 / D1 適用 / LINE 実送信 / 禁止帯ガード（`clampToDeliveryWindow()` QUIET 21–8）。

## 参照
- 記憶：`project_benavi_crm.md`（全詳細・本セッション反映済）／`project_codex_bridge.md`（委譲手順）。
- 設計正本：`docs/beNavigator_CRM_v1.md` / `…_V1_1_implementation_plan.md`。
- テンプレ：`docs/benavi-onboarding-template.md`（教育型）/ `docs/benavi-feed-template.md`（フィード型）。
