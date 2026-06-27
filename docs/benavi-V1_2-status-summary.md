# be Navigator CRM V1.2 到達点サマリー（2026-06-27）

> Hub（`?page=hub`）で目的を選ぶ → ルートタグ（R:）が付く → そのルートのオンボーディングが自動で始まる、というマルチルートCRMの「中身（各ルートのシナリオ）」を増やすフェーズ。本ファイルは次セッションへの引き継ぎ用サマリー。

---

## 1. 一言で（中学生にもわかる説明）

be Navigator は、看護師さんが LINE で「学びたいこと」を1つ選ぶと、その話題に合わせたメッセージが**7日間**毎日1通ずつ届く仕組みです。
- いまは **「心電図・循環器・心臓デバイス・心不全」の4つ**が本物として動いていて、選ぶと初日に「ようこそ」メッセージが届きます。
- 「AI活用」は文章ができていて、あとはスイッチを入れるだけ。
- 「文房具」「イベント」は、7日コースではなく**お知らせを不定期に流す掲示板タイプ**で、その設計図ができました。
- 大事なルール：**夜21時〜朝8時はメッセージを送らない**、**1回の選択で2通ダブって送らない**、の2つを守れる仕組みが入っています。

---

## 2. 本番稼働中のルート（実際に動いている）

| ルート | key | 起動タグ（R:） | シナリオID | 形式 | 状態 |
|---|---|---|---|---|---|
| 心電図 | ecg | R:心電図 `4cdecec7-…` | `a8c02e28-…` | 7日教育型（診断分岐あり） | 稼働中（V1.0からの看板） |
| 循環器 | circ | R:循環器 `c17ecb3c-…` | `c0cc3d89-…` | 7日教育型 | ✅ 稼働中（本セッションで本番化・E2E済） |
| 心臓デバイス | device | R:デバイス `b33180fd-…` | `f6cac1b4-…` | 7日教育型 | ✅ 稼働中（本セッションで本番化・E2E済） |
| 心不全 | hf | R:心不全 `6db94a31-…` | `010a6844-…` | 7日教育型 | ✅ 稼働中（本セッションで本番化・E2E済） |

- 全ルート共通：`trigger_type=tag_added` / `delivery_mode=relative` / 各 **7ステップ** / delay `0/1440/1440/1440/2880/1440/1440`（Day0/1/2/3/5/6/7）。
- live worker Version = **`a1a148de-cad3-4cea-b550-f39eef014216`**（T1＝二重メッセージ対策 反映済）。

## 3. 設計済みだが未稼働のルート

| ルート | key | 起動タグ（R:） | 形式 | できているところ | 未実施 |
|---|---|---|---|---|---|
| AI活用 | ai | R:AI `d0424f6f-…` | 7日教育型 | **本文案 確定**（`docs/benavi-ai-scenario.md`） | UUID発番／SQL／D1適用／E2E |
| 文房具・便利グッズ | goods | R:文房具 `52799965-…` | フィード型（2層） | **設計＋導入本文案 確定**（`docs/benavi-feed-template.md`） | 導入シナリオ本番化／broadcast運用 |
| イベント情報 | event | R:イベント `91733e50-…` | フィード型（2層） | **設計＋導入本文案 確定**（同上） | 導入シナリオ本番化／scheduled broadcast運用 |

- フィード型＝**層1 導入ミニシナリオ（tag_added・goods3/event2 steps）＋ 層2 R:タグ宛 broadcast**。event のリマインド等はイベントごとに scheduled broadcast。

## 4. できるようになったこと（このフェーズの成果）

- **教育型ルートの量産フローを確立**：共通テンプレ（`docs/benavi-onboarding-template.md`）で、変えるのは実質 **Day3（ミニ講義）と Day5（コンテンツ紹介）の2枠だけ**。device/hf はこれで短時間量産できた。
- **本番化フローを反復実証**：本文FIX → 固定UUID発番 → **Codex に .sql 生成委譲 → Claude レビュー** → 事前検証 → D1 export backup → `wrangler d1 execute --remote --file` 適用 → **テストユーザーで E2E（Day0のみ届く／intro Push抑制／enrollment completed停止）**。circ→device/hf で計3回成功。
- **T1（route-select の二重メッセージ対策）を本番反映**：R:タグに active な tag_added シナリオがあると intro Push を抑制し、Day0 が歓迎を兼ねる（二重Pushなし）。ecg は診断ブリッジ intro を維持。
- **フィード型の設計確定**：教育型と別構造（2層モデル）と判明。エンジン改修なしで broadcast＋scheduled_at で実現可能と整理。運用原則 **「価値提供8：告知2」** を明文化。
- **ドキュメント正本を main に集約**：circ（PR #14）／template+device+hf（PR #15）／AI+feed（PR #16）を squash merge 済。**main = 本番実態**。

## 5. まだやらないこと（保留・要オーナー判断）

- **AI / goods / event の本番化**（UUID→SQL→D1→E2E、broadcast運用開始）。設計・本文は揃っているが、今日は実施しない方針。
- **Phase C＝本番化（hub-entry を friend_add 化）**：友だち追加で自動的にルートに乗せる本番導線。**高リスク**（誤配信・全員巻き込み）のため、主要ルートが十分回ってからオーナーGoで。現状は hub-entry は manual のまま。
- broadcast の実配信（goods 新商品・event 案内）。

## 6. 次回やるなら、何から始めるべきか（推奨順）

1. **AI ルートの本番化**（最短・教育型と同フロー）：本文は確定済 → 固定UUID発番 → Codex で `ai_onboarding.sql` 生成 → Claude レビュー → export backup → D1適用 → テストユーザーE2E（Day0のみ）→ enrollment停止。これで教育型が**5ルート**に。
2. **goods/event 導入ミニシナリオの本番化**：同フロー（goods 3steps / event 2steps）。その後 **broadcast 運用開始**（管理画面・価値8:告知2・禁止帯ガード）。
3. （主要ルートが揃ったら）**Phase C＝friend_add 化**の検討。🔴要オーナー最終Go・委譲禁止。

> 着手前チェック：作業は必ず `main` から新ブランチ。本番化は「本文確定→UUID→Codex.sql→Claudeレビュー→backup→適用→E2E→docs本番稼働中化→PR」。**deploy/friend_add/D1適用/LINE実送信は高リスク＝オーナーGo必須**。

## 7. 開発者向け：正確な状態

- **リポ**：`/Users/manokouji/be Navigator/line-harness-oss`（origin=`beckhamichan/line-harness-oss`、upstream=`Shudesu/…`＝誤爆注意）。
- **main HEAD**：`98e4649`（PR #16 merge）。local=origin/main 0/0・clean。
- **live worker**：Version `a1a148de-cad3-4cea-b550-f39eef014216`（T1反映済）。デプロイは `pnpm --filter worker run deploy`（`pnpm deploy` は不可）。
- **D1（line-harness）**：tag_added active scenario = ecg / circ / device / hf の **4本・各7steps**。AI/goods/event は **未投入**。
- **投入済SQL（main上）**：`circ_onboarding.sql` / `device_onboarding.sql` / `hf_onboarding.sql`（再適用不要＝PK衝突）。
- **正本ミラー docs**：`benavi-onboarding-scenario.md`(ecg) / `benavi-circulation-scenario.md`(circ) / `benavi-device-scenario.md` / `benavi-heartfailure-scenario.md`（=本番稼働中）／`benavi-ai-scenario.md`（本文案）／`benavi-onboarding-template.md`（教育型テンプレ）／`benavi-feed-template.md`（フィード型設計）。
- **固定UUID（未稼働ルートの発番予定なし＝本文確定後に発番）**：AI/goods/event はまだ UUID 未発番。
- **直近 backup**：`/tmp/benavi/d1_full_20260627-103235.sql`（揮発注意・恒久化したいなら別途保存）。
- **テストユーザー（E2E用）**：friend.id `99ca91bf-4388-…`（Koji Mano）。R:心電図/循環器/デバイス/心不全 タグ＋各 completed enrollment 保持。**再E2E時は過去 enrollment を要 DELETE**（`attachTagAndFireSideEffects` は status を問わず既存 enrollment があると enroll をスキップするため）。lineUserId は秘密＝ログに出さない。
- **委譲**：SQL生成等は codex-bridge（`~/codex-bridge/scripts/codex-task.sh --write --file …`）→ Claude レビュー。
- **安全ガード**：配信禁止帯 JST21:00–8:00（`clampToDeliveryWindow()`）。broadcast は手動 `scheduled_at` のため禁止帯に置かない運用ルール。

## 8. 引き継ぎ参照
- 記憶：`project_benavi_crm.md`（全詳細・本セッション反映済）。
- 設計正本：`docs/beNavigator_CRM_v1.md` / `…_V1_1_implementation_plan.md`。
- 本サマリー：`docs/benavi-V1_2-status-summary.md`（このファイル）。
