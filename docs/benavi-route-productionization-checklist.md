# beナビ 教育型ルート 本番化チェックリスト（量産用・1ページ）

> 教育型7日オンボ（ecg / circ / device / hf / ai …）を**6本目以降も同じ手順で漏れなく**本番化するための作業チェックリスト。
> 本文の作り方は [benavi-onboarding-template.md](benavi-onboarding-template.md)（Day3/Day5の2枠だけ執筆）を参照。本書は「本文確定後〜本番稼働まで」の**運用フロー**を担当する。
> 🔴 = **オーナーGo必須**（データ破壊・二重送信・本番反映に関わる不可逆操作）。順番を飛ばさない。

## 0. 前提（着手前の確認）
- [ ] 本文が確定している（`benavi-<route>-scenario.md` の全7ステップが「本文OK」）
- [ ] 当該 `R:<route>` タグID を控えてある（[V1_1_implementation_plan.md](beNavigator_CRM_V1_1_implementation_plan.md) のタグ表）
- [ ] 作業ブランチを切ってある（`feat/<route>-onboarding` など。main直push禁止）

## 1. 発番・ドキュメント（安全）
- [ ] **UUID発番**：scenario ×1 + steps ×7（`uuidgen` を小文字化。固定して以後変えない）
- [ ] **md更新**：`benavi-<route>-scenario.md` のシナリオ定義表へ発番UUIDを記入

## 2. SQL生成・レビュー（安全）
- [ ] **SQL生成**：`<route>_onboarding.sql` を作成（Codex委譲推奨。雛形＝ `device_onboarding.sql`）
- [ ] **Claudeレビュー**：以下を突き合わせる
  - [ ] 本文 ↔ SQL が1文字単位で一致（改行・絵文字・全角記号含む）
  - [ ] `trigger_type='tag_added'` / `trigger_tag_id` = 当該 `R:<route>` / `delivery_mode='relative'` / `is_active=1`
  - [ ] delay 並び＝ `0/1440/1440/1440/2880/1440/1440`（step_order 1→7）
  - [ ] 禁止文・実在しないコンテンツ名の断定がゼロ
  - [ ] UUIDが既存ルートと重複していない（PK衝突防止）

## 3. 適用（🔴 オーナーGo必須）
- [ ] 🔴 **事前検証**：R:タグが存在 / 当該 scenario が未投入（UUID未発番＝D1に無い）を確認
- [ ] 🔴 **export backup**：D1フルダンプを取得（適用直前。保存先は揮発前提、必要なら永続化）
- [ ] 🔴 **D1適用**：`<route>_onboarding.sql` を本番D1へ INSERT（再適用不可＝PK衝突に注意）
- [ ] 🔴 **deploy**：worker側に変更がある場合のみ `pnpm --filter worker run deploy`（main から）

## 4. 検証（🔴 テストユーザーのみ）
- [ ] 🔴 **E2E**：route-select で interest=`<route>` → **Day0のみ届く**／intro Push抑制（T1）を確認
  - ⚠️ テストユーザーの**過去enrollを事前DELETE**（`attachTagAndFireSideEffects` は status不問で既存ありなら enroll スキップ）
  - ⚠️ 配信禁止帯 **JST 21:00〜翌8:00** に手動 `scheduled_at` を置かない
- [ ] 🔴 **enrollment停止**：テストの enrollment を `completed` にして以降の配信を止める

## 5. 確定（安全）
- [ ] **docs更新**：`benavi-<route>-scenario.md` を「本番稼働中」へ更新＋更新履歴に適用記録（Versionハッシュ等）
- [ ] **PR**：本文md・SQL・本チェックリストの差分でPR（Issue番号紐付け／PRテンプレ記入）
- [ ] **merge**：レビュー後 main へマージ（main＝本番実態を維持）

---

### 稼働ルート記録（追記運用）
| route | scenario UUID | trigger_tag (R:) | 適用日 | 状態 |
|---|---|---|---|---|
| ecg | （済） | R:心電図 | — | 本番稼働中 |
| circ | （済） | R:循環器 | — | 本番稼働中 |
| device | f6cac1b4-883d-4cb2-a77f-63f52ba2e14c | R:デバイス | — | 本番稼働中 |
| hf | （済） | R:心不全 | — | 本番稼働中 |
| ai | dabed850-2c0f-450a-a3d6-957141ba0388 | R:AI | — | ⬜ 適用待ち |

> 6本目以降（PCI / エコー / 薬剤 など）も本表に1行追加して同手順で進める。
