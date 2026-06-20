# be Navigator CRM V1.1 実装作業指示書（Hub入口・マルチルート最小実装）

> 目的：Claude Code（または実装者）が**そのまま着手できる**作業指示。設計は `beNavigator_CRM_v1.md` に準拠。
> 状態：**未実装**。本書は指示のみ。実装はオーナーGo後。
> 作成：2026-06-21

## V1.1 のゴール（スコープ確定）
LINE登録者が **Hub（?page=hub）で目的を1つ選ぶ → 興味/ルートタグが付く → tag_added で対応ルートが自動開始**、を最小実装する。
- 心電図ルート＝既存 `a8c02e28` を tag_added 起動に統一（Phase B）。
- 他6ルートはまず **タグ捕捉＋「準備中」案内**（シナリオ本体はV1.2）。
- **friend_add 本番化は Phase C（オーナーGo後）**。本書の Phase A/B は friend_add を変更しない。

## 重要な実装ルール（厳守）
- タグ付与は必ず **`attachTagAndFireSideEffects(db, friendId, tagId)`** を使う（tag_added発火＆tag_change。生 `addTagToFriend` は発火しない＝リスクR1）。
- `/api/liff/*` は認証自動スキップ＝公開。お手本は `POST /api/liff/diagnosis`。
- シークレットをコードに書かない。D1スキーマ変更なし。
- **本書の各UUIDは確定値**（コードとSQLで一致させる）。

---

## 1. V1.1 実装仕様書（全体フロー）

```
[Phase A: 追加のみ・trigger変更なし]
 友だち（テストユーザー）に hub-entry を手動enroll → Day0(歓迎＋hubリンク)受信
   ↓ Hub(?page=hub)で1つ選択
 POST /api/liff/route-select { lineUserId, interest }
   ↓ サーバー:
     ・friend解決
     ・I:<route> タグ付与（attachTagAndFireSideEffects）
     ・R:<route> タグ付与（attachTagAndFireSideEffects＝tag_added起動トリガー）
     ・metadata.interests に追記（配列・重複排除）＋ interest_selected_at / route_primary
     ・ルート別の案内Push（ecg=診断へ誘導／他=準備中）
     ・return { interest, nextPage }（ecgのみ 'diagnosis'）
   ↓ クライアント:
     ・ecg → location =(?page=diagnosis) へ遷移（既存診断フロー）
     ・他   → 完了画面＋ liff.closeWindow()

[Phase B: ecg を tag_added 化（テスト）]
 a8c02e28: trigger_type='tag_added', trigger_tag_id=<R:心電図> に更新
   → R:心電図 付与で a8c02e28 が自動enroll（Day0診断誘導）。診断endpointのenrollはno-op保険。

[Phase C: 本番化＝オーナーGo後・本書では実行しない]
 hub-entry: trigger_type='friend_add' に更新（友だち追加でHub案内が自動配信）
```

ルート定義テーブル（コードの定数 `ROUTE_MAP` として実装）：

| key | ラベル | I:タグID | R:タグID | ルートシナリオ | nextPage |
|---|---|---|---|---|---|
| ecg | 心電図 | `f8e2d40b-8ef1-45dc-924b-8dcf81982428` | `4cdecec7-c40d-4fb1-b972-8e530dc60111` | a8c02e28（既存） | diagnosis |
| circ | 循環器 | `b3545378-3204-4376-bc04-3b26bcaa0904` | `c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57` | （V1.2） | null |
| device | デバイス | `bd9db693-5d1f-4327-b68b-1e370c7d9f37` | `b33180fd-6e12-40ae-aeb4-5db74d785b6f` | （V1.2） | null |
| hf | 心不全 | `e8450b35-5139-43f9-8589-01e839b53ee3` | `6db94a31-3e2b-41b2-9d41-85948387cd03` | （V1.2） | null |
| ai | AI活用 | `84facca0-3009-4336-935c-ce4e0520e99c` | `d0424f6f-4343-455f-af6a-f2a32b7a4b62` | （V1.2） | null |
| goods | 文房具 | `d064e848-8065-4c90-ac85-9aec4c82868b` | `52799965-061a-4710-8e9c-d0cedac02dc8` | （V1.2） | null |
| event | イベント | `94c4c650-a41d-4c56-9aa6-1c46a3841c59` | `91733e50-e511-4353-96f5-906c54230f95` | （V1.2） | null |

---

## 2. 実装対象ファイル一覧
- 🆕 `apps/worker/src/client/hub.ts`（Hub UI／`initHub()`）
- ✏️ `apps/worker/src/client/main.ts`（`?page=hub` 分岐 1行追加）
- ✏️ `apps/worker/src/routes/liff.ts`（`POST /api/liff/route-select` 追加＋`ROUTE_MAP`定数）
- 🆕 `apps/worker/src/routes/liff.test.ts` に route-select のテスト追加（または既存テストへ）
- 🆕 `apps/worker/src/services/step-delivery` 系は **変更不要**（type_tip等は心電図ルート専用で既存のまま）
- 📄 D1：タグ14件＋hub-entryシナリオ＋（Phase B）a8c02e28 trigger更新（SQLは §9）
- 📄 `docs/benavi-onboarding-scenario.md` に hub-entry を追記（正本ミラー運用）

---

## 3. 新規作成ファイル

### `apps/worker/src/client/hub.ts`（雛形）
diagnosis.ts と同型。`liff.getProfile()` で userId 取得 → 7カード描画（単一選択）→ 確定で route-select。
```ts
// 概要:
// - DOM: #app にヒーロー/船長歓迎/7カード/CTAを描画（§6文面）
// - 単一選択（ラジオ的）。確定ボタンは選択後に活性。
// - 送信: fetch('/api/liff/route-select', { method:'POST',
//          headers:{'content-type':'application/json'},
//          body: JSON.stringify({ lineUserId: profile.userId, interest }) })
// - 応答 data.nextPage==='diagnosis' なら location.search='?page=diagnosis&liffId=...'
//   それ以外は完了画面 → liff.closeWindow()
// declare const liff …（diagnosis.ts の宣言を流用）
export async function initHub(): Promise<void> { /* … */ }
```
- CSS は diagnosis 同様に1回だけ注入。トーンは航海・ドット風で世界観統一。
- liffId は `new URLSearchParams(location.search).get('liffId')` を保持し、diagnosis遷移時に引き継ぐ。

---

## 4. 変更ファイル

### `apps/worker/src/client/main.ts`（分岐追加・1か所）
```ts
import { initHub } from './hub.js';
// …
} else if (page === 'diagnosis') {
  await initDiagnosis();
} else if (page === 'hub') {          // ← 追加
  await initHub();                    // ← 追加
} else if (page === 'form') {
```

### `apps/worker/src/routes/liff.ts`（route-select 追加・diagnosis endpoint の直後に配置）
- 既存 import（`getFriendByLineUserId`, `getLineAccountById`, `jstNow`）を流用。
- 追加 import：`attachTagAndFireSideEffects`（`../services/friend-tag-attach.js`）。
- `ROUTE_MAP` を §1テーブルの内容でサーバー定数として定義（label/iTag/rTag/nextPage/introメッセージ）。

---

## 5. route-select API 仕様

**`POST /api/liff/route-select`**（公開・`/api/liff/`配下）

リクエスト
```json
{ "lineUserId": "U...", "interest": "ecg|circ|device|hf|ai|goods|event" }
```

処理
1. `interest` が ROUTE_MAP のキーか検証。不正 → 400。
2. `getFriendByLineUserId(db, lineUserId)`。無ければ 404。
3. `attachTagAndFireSideEffects(db, friend.id, ROUTE_MAP[interest].iTag)` … 興味タグ（恒久）。
4. `attachTagAndFireSideEffects(db, friend.id, ROUTE_MAP[interest].rTag)` … ルートタグ（tag_added起動）。
   - ecgかつPhase B以降：a8c02e28（tag_added）が自動enroll。Phase A時点では何も起きない（後でdiagnosisがenroll）。
5. metadata マージ更新（read→parse→merge→UPDATE、diagnosis endpoint と同手順）：
   - `interests`: 既存配列に interest を追加（重複排除）。
   - `route_primary`: interest（初回のみ設定、以降は据え置き or 最新で上書きは実装方針で選択。推奨＝初回のみ）。
   - `interest_selected_at`: jstNow()。
6. ルート別の案内Push（best-effort・失敗してもフロー継続。diagnosis endpoint の push 処理を流用、messages_log 記録）：
   - ecg：「『心電図』の航海へようこそ🚢 さっそく航海マップ（60秒診断）から始めましょう。」
   - 他：「『{label}』に興味を持ってくれてありがとう🚢 いま航路を準備しています。整い次第いちばんにご案内しますね。——ベッカミ」
7. レスポンス
```json
{ "success": true, "data": { "interest": "ecg", "label": "心電図", "nextPage": "diagnosis" } }
```
（ecg以外は nextPage:null）

エラー処理：try/catch で 500、console.error。diagnosis endpoint と同じ書式。

> 注意：route-select は **enrollを自前で呼ばない**（ルーティングは R:タグの tag_added に任せる）。これが「タグ駆動」の一貫性。ecgのnextPage遷移後の diagnosis endpoint enroll は従来どおり。

---

## 6. Hub画面の最終文面

### ヒーロー
- 上段：`be Navigator`
- 見出し：`ようこそ、be Navigatorへ`🫀
- サブ：`あなたの“学びの航海”は、ここから始まります`

### 船長からの歓迎
> はじめまして、船長のベッカミです。🫀
> be Navigatorは、心電図だけの船じゃありません。循環器も、心不全も、デバイスも、現場で使う道具も、そして一緒に学ぶ仲間も——ナースの「学びたい」を、まるごと乗せた船です。
> まずは、あなたが“今いちばん”知りたいことを、1つだけ教えてください。

### 問いかけ
- 見出し：`今、いちばん学びたい・知りたいことは？`
- 補足：`1つ選んでください（あとから、ほかの興味も追加できます）`

### カード（タイトル／説明）
| key | タイトル | 説明 |
|---|---|---|
| ecg | 心電図を学びたい | 「読める」から「使える・語れる」へ |
| circ | 循環器を学びたい | 基礎から、体系的に |
| device | 心臓デバイス／ペースメーカー | デバイスを、もう一歩深く |
| hf | 心不全を学びたい | 病態から治療まで、つなげて理解 |
| ai | AI活用に興味がある | 看護×AIの、いまの最前線 |
| goods | 文房具・便利グッズがほしい | 現場で本当に使える道具の情報 |
| event | イベント情報がほしい | ナースまつり・セミナーの最新案内 |

### 安心の一言
> 「全員、最初は読めませんでした。」どの航路を選んでも、ひとりにはしません。

### CTA
- ボタン：`この航海に出航する`🚢
- 補足：`あとから、ほかの興味も追加できます`

### 完了画面（ecg以外）
> 「{label}」の航海へ、ようこそ！🚢 ご案内はLINEにお送りします。画面を閉じてお待ちください。

### hub-entry シナリオ Day0（歓迎＋Hubリンク）
> ようこそ、be Navigatorへ🫀 友だち追加ありがとうございます。
> ここは、心電図も循環器も、現場の道具も仲間も乗せた“学びの船”。
> まずは、あなたが今いちばん知りたいことを1つ教えてください。あなたにぴったりの航路へご案内します👇
> https://liff.line.me/2010453320-O9UsF9z4?page=hub
> ——ベッカミ（船長／看護師・心臓カテ室20年）

---

## 7. 作成するタグ一覧（14件）

| name（表示） | color案 | id（確定） |
|---|---|---|
| I:心電図 | #85B7EB | f8e2d40b-8ef1-45dc-924b-8dcf81982428 |
| I:循環器 | #85B7EB | b3545378-3204-4376-bc04-3b26bcaa0904 |
| I:デバイス | #85B7EB | bd9db693-5d1f-4327-b68b-1e370c7d9f37 |
| I:心不全 | #85B7EB | e8450b35-5139-43f9-8589-01e839b53ee3 |
| I:AI | #85B7EB | 84facca0-3009-4336-935c-ce4e0520e99c |
| I:文房具 | #85B7EB | d064e848-8065-4c90-ac85-9aec4c82868b |
| I:イベント | #85B7EB | 94c4c650-a41d-4c56-9aa6-1c46a3841c59 |
| R:心電図 | #378ADD | 4cdecec7-c40d-4fb1-b972-8e530dc60111 |
| R:循環器 | #378ADD | c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57 |
| R:デバイス | #378ADD | b33180fd-6e12-40ae-aeb4-5db74d785b6f |
| R:心不全 | #378ADD | 6db94a31-3e2b-41b2-9d41-85948387cd03 |
| R:AI | #378ADD | d0424f6f-4343-455f-af6a-f2a32b7a4b62 |
| R:文房具 | #378ADD | 52799965-061a-4710-8e9c-d0cedac02dc8 |
| R:イベント | #378ADD | 91733e50-e511-4353-96f5-906c54230f95 |

---

## 8. 作成するシナリオ一覧（V1.1）

| コード名 | id | trigger | trigger_tag_id | is_active | 状態 |
|---|---|---|---|---|---|
| hub-entry（入口・歓迎＋Hub案内） | a8295fda-5189-46ce-aba9-11da662e1d49 | **manual**（Phase Cでfriend_add） | NULL | 1 | 新規・Day0のみ |
| ecg-onboarding（既存 a8c02e28） | a8c02e28-beb1-4202-ac83-b39401a56e42 | **Phase Bで tag_added** | **R:心電図**=4cdecec7-… | 1 | 既存・trigger更新のみ |

> 他6ルートのシナリオはV1.2。V1.1では作らない（タグ捕捉＋準備中Pushで受ける）。

---

## 9. D1更新SQL案

### 9-A. タグ14件作成（Phase A）
```sql
INSERT INTO tags (id,name,color,created_at) VALUES
 ('f8e2d40b-8ef1-45dc-924b-8dcf81982428','I:心電図','#85B7EB','2026-06-21T12:00:00+09:00'),
 ('b3545378-3204-4376-bc04-3b26bcaa0904','I:循環器','#85B7EB','2026-06-21T12:00:00+09:00'),
 ('bd9db693-5d1f-4327-b68b-1e370c7d9f37','I:デバイス','#85B7EB','2026-06-21T12:00:00+09:00'),
 ('e8450b35-5139-43f9-8589-01e839b53ee3','I:心不全','#85B7EB','2026-06-21T12:00:00+09:00'),
 ('84facca0-3009-4336-935c-ce4e0520e99c','I:AI','#85B7EB','2026-06-21T12:00:00+09:00'),
 ('d064e848-8065-4c90-ac85-9aec4c82868b','I:文房具','#85B7EB','2026-06-21T12:00:00+09:00'),
 ('94c4c650-a41d-4c56-9aa6-1c46a3841c59','I:イベント','#85B7EB','2026-06-21T12:00:00+09:00'),
 ('4cdecec7-c40d-4fb1-b972-8e530dc60111','R:心電図','#378ADD','2026-06-21T12:00:00+09:00'),
 ('c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57','R:循環器','#378ADD','2026-06-21T12:00:00+09:00'),
 ('b33180fd-6e12-40ae-aeb4-5db74d785b6f','R:デバイス','#378ADD','2026-06-21T12:00:00+09:00'),
 ('6db94a31-3e2b-41b2-9d41-85948387cd03','R:心不全','#378ADD','2026-06-21T12:00:00+09:00'),
 ('d0424f6f-4343-455f-af6a-f2a32b7a4b62','R:AI','#378ADD','2026-06-21T12:00:00+09:00'),
 ('52799965-061a-4710-8e9c-d0cedac02dc8','R:文房具','#378ADD','2026-06-21T12:00:00+09:00'),
 ('91733e50-e511-4353-96f5-906c54230f95','R:イベント','#378ADD','2026-06-21T12:00:00+09:00');
```
※ 既存初期タグ（「AI活用に興味あり」「循環器初心者」等）とは別物。重複させず、新CRMはこのR/I体系で統一。

### 9-B. hub-entry シナリオ＋Day0（Phase A）
```sql
INSERT INTO scenarios (id,name,description,trigger_type,trigger_tag_id,is_active,delivery_mode,created_at,updated_at)
VALUES ('a8295fda-5189-46ce-aba9-11da662e1d49','hub-entry（入口）','登録直後の歓迎＋Hub案内',
        'manual',NULL,1,'relative','2026-06-21T12:00:00+09:00','2026-06-21T12:00:00+09:00');

INSERT INTO scenario_steps (id,scenario_id,step_order,delay_minutes,message_type,message_content,created_at)
VALUES ('3443cc99-c405-455b-aef5-b21bcce81996','a8295fda-5189-46ce-aba9-11da662e1d49',1,0,'text',
'ようこそ、be Navigatorへ🫀 友だち追加ありがとうございます。
ここは、心電図も循環器も、現場の道具も仲間も乗せた“学びの船”。
まずは、あなたが今いちばん知りたいことを1つ教えてください。あなたにぴったりの航路へご案内します👇
https://liff.line.me/2010453320-O9UsF9z4?page=hub
——ベッカミ（船長／看護師・心臓カテ室20年）','2026-06-21T12:00:00+09:00');
```
※ scenarios の列はスキーマに合わせる（created_at/updated_at あり）。scenario_steps は updated_at 列なし。

### 9-C. ecg を tag_added 化（Phase B・テスト後に実施）
```sql
UPDATE scenarios SET trigger_type='tag_added', trigger_tag_id='4cdecec7-c40d-4fb1-b972-8e530dc60111'
WHERE id='a8c02e28-beb1-4202-ac83-b39401a56e42';
```

### 9-D. 本番化（Phase C・オーナーGo後・本書では実行しない）
```sql
UPDATE scenarios SET trigger_type='friend_add' WHERE id='a8295fda-5189-46ce-aba9-11da662e1d49';
```

---

## 10. テスト項目

### ユニット（vitest・apps/worker）
- route-select：interest不正→400／friend無し→404／正常→200・data.nextPage（ecg='diagnosis'/他=null）。
- route-select：`attachTagAndFireSideEffects` が I/R 両タグ分呼ばれる（モック）。
- route-select：metadata.interests に重複追加されない（既存に同値があれば増えない）。
- 既存：step-delivery / scenarios の全テストが緑のまま（536+）。
- typecheck（tsc --noEmit）緑。build 緑。

### 結合（描画・送信なし）
- main.ts：`?page=hub` で initHub が呼ばれる分岐の確認。
- ROUTE_MAP のキー7件・タグID/シナリオIDが §1表と一致。

---

## 11. 実機E2E手順（Phase A→B・テストユーザーのみ）

前提：テストユーザー Koji Mano（friend 99ca91bf-4388-…、is_following=1）。手動cronトリガーは無い→next_delivery_atを過去にして5分毎cronを待つ方式（V1.0 E2Eと同じ）。

**Phase A（Hub→タグ→準備中）**
1. デプロイ（`pnpm --filter worker build` → `wrangler deploy`）。
2. `?page=hub` を開く（テストユーザー）→ 7カード表示・単一選択・CTA活性を確認。
3. 例「循環器」を選択 → route-select 200。
4. D1確認：friend_tags に `I:循環器`/`R:循環器` 付与、friends.metadata.interests に "circ"。
5. messages_log に「準備中」案内が記録＝Push送信確認（実機受信OK）。

**Phase B（Hub「心電図」→a8c02e28自動起動）**
6. 9-C を適用（ecg=tag_added, trigger_tag=R:心電図）。
7. テストユーザーの `R:心電図`/`I:心電図` を一旦外す（再テストのため）：`DELETE FROM friend_tags WHERE friend_id LIKE '99ca91bf%' AND tag_id IN (R:心電図, I:心電図)`。既存 a8c02e28 enrollment があれば status を確認/クリア。
8. `?page=hub`→「心電図」選択 → route-select が R:心電図 付与 → **a8c02e28 が自動enroll**（friend_scenarios に新規 active）。
9. クライアントが `?page=diagnosis` へ遷移 → 診断完走 → 結果Push＋metadata（既存V1.0動作）。
10. 必要なら Day3/Day5 を next_delivery_at 過去化で cron 配信確認（V1.0 E2Eと同手順）。
11. E2E後、テストユーザーの状態を元に戻す（タグ・enrollmentを整理）。

※ Phase C（friend_add化）はオーナーGo後に別途。E2Eでは実施しない。

---

## 12. ロールバック手順
- **コード**：`feat/liff-diagnosis`（または新ブランチ）の該当コミットを revert → 再デプロイ。Worker はバージョンロールバック可。
- **タグ**：`DELETE FROM tags WHERE id IN (…14 UUID…)`（friend_tags も併せて整理）。
- **hub-entry シナリオ**：`DELETE FROM scenario_steps WHERE scenario_id='a8295fda-…'; DELETE FROM scenarios WHERE id='a8295fda-…';`
- **ecg trigger（9-C）戻し**：`UPDATE scenarios SET trigger_type='manual', trigger_tag_id=NULL WHERE id='a8c02e28-…';`
- **適用前にD1バックアップ**（`d1-backups/` にexport）。
- ロールバックSQLは適用直前に「現状SELECT→UPDATE文生成」で退避（V1.0と同方式）。

---

## 13. 実装順序（チェックリスト）

**Phase A（追加のみ・friend_add変更なし・trigger=manual維持）**
1. [ ] ブランチ作成（例 `feat/hub-multiroute`）＋ 実装前にD1 export。
2. [ ] D1：9-A（タグ14件）適用 → 14件INSERT確認。
3. [ ] D1：9-B（hub-entry＋Day0）適用 → scenario/step確認。
4. [ ] コード：`hub.ts` 新規（§3/§6）。
5. [ ] コード：`main.ts` に `?page=hub` 分岐追加（§4）。
6. [ ] コード：`liff.ts` に `ROUTE_MAP`＋`POST /api/liff/route-select`（§5）。
7. [ ] テスト：route-select ユニット追加（§10）→ vitest / tsc / build 緑。
8. [ ] デプロイ（wrangler deploy）。
9. [ ] E2E Phase A（§11 1-5）：テストユーザーでHub→タグ→準備中Push確認。
10. [ ] `docs/benavi-onboarding-scenario.md` に hub-entry を追記（正本ミラー）。
11. [ ] commit / push。

**Phase B（ecg を tag_added 化・テスト）**
12. [ ] D1：9-C 適用。
13. [ ] E2E Phase B（§11 6-11）：Hub「心電図」→a8c02e28自動起動→診断→結果。
14. [ ] 問題なければ commit（D1変更の記録）/ 正本md更新。

**Phase C（本番化・オーナーGo後・本書では実行しない）**
15. [ ] D1：9-D（hub-entry を friend_add）。
16. [ ] 新規友だちで「追加→Hub案内→選択→ルート起動」を1回実走確認。

---

## 既知の注意・リスク（実装時に確認）
- **R1（最重要）**：タグ付与は `attachTagAndFireSideEffects` を使う。生 `addTagToFriend` では tag_added が発火しない。
- **R2**：ecg は R:心電図付与で a8c02e28 enroll ＋ 診断endpointでも enroll → 二重だが no-op 安全。
- **R3**：V1.1で circ等を選んだ早期ユーザーは R:タグ保持済。V1.2でそのルートシナリオ（tag_added）を作っても**既存タグは再発火しない** → V1.2で「既存R:保持者を一括enroll or 一斉配信」でバックフィルする（要手順）。
- **R4**：metadata.interests は配列で保持（将来の複数興味に備え）。route_primary は初回のみ設定推奨。
- **R5**：Hubの liffId 引き継ぎ（ecg→diagnosis遷移時に `?liffId=` を保持）。
- **R6**：既存友だちは friend_add で Hub を受け取れない → Phase C後、一斉配信でHubリンク（リッチメニューはR2課金未対応で保留）。
- **R7**：scenarios.created_at/updated_at は必須列。scenario_steps に updated_at 列は無い（V1.0で確認済）。

---

## 付録：参照（事実確認済）
- `attachTagAndFireSideEffects(db, friendId, tagId)` … `apps/worker/src/services/friend-tag-attach.ts`（tag_added enroll＋tag_change）。
- `POST /api/liff/diagnosis` … `routes/liff.ts:1856`（friend解決/metadata merge/push/enroll のお手本）。
- `?page=` 分岐 … `client/main.ts:475-`。LIFF init は `?liffId=` param。`initDiagnosis` は `liff.getProfile()` で userId 取得し相対URL fetch。
- schema：tags(id,name,color,created_at) / scenarios(id,name,description,trigger_type,trigger_tag_id,is_active,delivery_mode,created_at,updated_at,line_account_id) / scenario_steps(id,scenario_id,step_order,delay_minutes,message_type,message_content,offset_days,offset_minutes,delivery_time,template_id,on_reach_tag_id,created_at,condition_type,condition_value,next_step_on_false)。
- 設計：`beNavigator_CRM_v1.md`（CRM全体）、`beナビ_CRM_入口分岐_設計レビュー_v0.md`（Hubワイヤーフレーム）。
