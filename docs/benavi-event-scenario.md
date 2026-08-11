# beナビ event ルート 導入ミニシナリオ（2日間・情報購読型）— 【本番稼働中】

> **適用記録（2026-06-27 JST）**：D1 `line-harness` へ `event_onboarding.sql` 適用（scenario `3fc03f4a…` + steps×2・changes4）。backup `d1-backups/line-harness_pre-event_20260627-164512.sql`。E2E（route-select interest=event）→ **Day0のみ1通配信・intro抑制・next=Day2相当(+2880分)** を確認し enrollment を completed で停止。deploy 不要（ROUTE_MAP に `event` 実装済・intro抑制は scenario 投入で自動ON）。

> route key=`event`（タグ `R:イベント`）。フィード型2層モデルの「層1＝導入ミニシナリオ」。設計の母体は [benavi-feed-template.md](benavi-feed-template.md)。
> **コンセプト**：「イベント告知LINE」ではなく、**“学び”と“人との出会い”につながる場の情報が届くLINE**。be Navigatorのイベント（ナースまつり・セミナー・勉強会・オフ会）に共通する価値＝**同じ想いを持つ仲間と出会えること**を温かく伝える。
> 署名は全ステップ `——be Navigator`。
> 個別イベント告知・リマインド・当日・終了後フォローは**層2の scheduled broadcast**（`E:<イベント名>` タグ）で運用。本シナリオは**特定日を埋め込まないエバーグリーン**。

## シナリオ定義

| 項目 | 値 |
|---|---|
| scenario name | `イベント情報ルート 導入（2日間）` |
| route key | `event` |
| trigger_type | `tag_added` |
| trigger_tag_id | **R:イベント** `91733e50-e511-4353-96f5-906c54230f95` |
| delivery_mode | `relative` |
| 診断分岐 | なし |
| ステップ | 2（Day0/Day2・delay `0 / 2880`） |
| UUID scenario | `3fc03f4a-29f7-4014-b8d4-99c109b13f8c` |
| UUID steps 1–2 | `3f5914ed-022c-4f36-8f37-05e0a640a951` / `492c9922-7ba1-43a0-b559-572100842047` |

## 事実の根拠（推測なし・出典）
- Hub定義「🎉 イベント情報がほしい → ナースまつり・セミナー」。`beナビ_CRM_入口分岐_設計レビュー_v0`
- イベント種別＝ナースまつり／テーマ別セミナー／Zoom勉強会／検定対策 等。`部門/コンテンツ教育/状況`
- 個別イベントは `E:<イベント名>` タグ＋scheduled broadcast で運用（`E:ナースまつり2026` 等）。`beNavigator_CRM_v1`
- ナースまつり2026は直近開催 → 固定日は本文に入れず、層2 broadcast で都度告知。

---

## ステップ本文（確定）

### Day0（step_order 1・delay 0）— 歓迎＋“つながるきっかけ”
```
ようこそ、be Navigatorへ🎉
「イベント情報がほしい」を選んでくれて、ありがとうございます。

ここは、ナースまつり・セミナー・勉強会・オフ会など——“学び”と“人との出会い”につながる場の情報が届くLINEです。
be Navigatorのイベントに共通しているのは、同じ想いを持つ仲間と出会えること。ひとりで頑張らなくていい、そんな“つながるきっかけ”をお届けします。

次のイベントが決まったら、ここでいちばんにお知らせしますね。参加はもちろん、「まずは見るだけ」も大歓迎です😊
——be Navigator
```

### Day2（step_order 2・delay 2880）— やわらか送客
```
イベントは、学びの「きっかけ」。
同じ現場の仲間と顔を合わせて話すと、ひとりの勉強より、ぐっと楽しく続きます。

もし「イベントだけじゃなく、日々の学びも“ゆるく”はじめたい」と思ったら、心電図や循環器などの入口はこちらに👇
https://liff.line.me/2010453320-O9UsF9z4?page=hub

次のイベントが決まったら、またここでお知らせします。
——be Navigator
```

---

## 本番化フロー（実施済み・2026-06-27）
1. ✅ 本文FIX（本書）／固定UUID発番
2. ✅ `event_onboarding.sql` 生成 → Claudeレビュー（本文↔md一致2/2・UUID衝突0）
3. ✅ 事前検証 → export backup → D1適用（オーナーGo・changes4）
4. ✅ E2E（Day0のみ1通・intro抑制）→ enrollment completed 停止
5. ✅ 本書を「本番稼働中」へ更新＋適用記録

## 残課題（運用・任意）
- 層2 broadcast 運用開始（告知／リマインド／当日／終了後フォロー・禁止帯ガード・価値8:告知2）。
- 来場者は `E:<イベント名>` タグ → event-followup で絞り込み。
