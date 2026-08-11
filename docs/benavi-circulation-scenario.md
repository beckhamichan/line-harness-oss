# beナビ 循環器ルート オンボーディング（7日間・教育型）— シナリオ正本ミラー【本番稼働中】

> ✅ **本ファイルは Cloudflare D1 上の circ シナリオ文面の git 追跡ミラー（正本）です。** 心電図ルート（[benavi-onboarding-scenario.md](benavi-onboarding-scenario.md)）と同じ「D1ミラー運用」。**文面を変えるときは「D1 と本ファイルの両方」を更新する**こと。
> - **2026-06-27 に D1 投入・本番稼働開始・実機 E2E 成功済。** 適用記録は末尾「更新履歴」を参照。
> - **コピーは雛形（心電図 a8c02e28）からの再起案。確定版コピーは前セッションのコンテキスト要約で本文が失われたため再執筆し、同日オーナー文面レビュー（5観点）を反映して FIX した。** 反映：①Day0 歓迎文追記・③Day5/Day7「循環器シリーズ」→実態に合わせ「循環器の勉強会・コンテンツ」表現へ（週5回/21:30/アーカイブ236本以上は実態どおり据え置き）・②Day3 二択クイズは初心者方針で現状維持・④Day2 重複は将来課題として記録（下記）。
> - **将来課題（V1.2スコープ外・記録のみ）**：Day2「船を出した理由」は心電図ルート Day2 とほぼ同文。R:心電図 と R:循環器 を両方選んだ友だちは Day2 で重複体験になる。複数ルート登録者向けの共有ステップ重複排除は将来検討（現状は他ルート R:タグ保持者は実E2Eのテストユーザーのみ）。

## シナリオ定義

- シナリオ ID（固定発番）: `c0cc3d89-cd8e-4f36-9734-3e291076e3ca`
- `name`: `循環器ルート オンボーディング（7日間）`
- `trigger_type`: **tag_added**（起動タグ `trigger_tag_id` = `c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57` ＝ **R:循環器**）
  - 起動経路：Hub（`?page=hub`）で「循環器」選択 → route-select が `R:循環器` 付与 → `attachTagAndFireSideEffects` の tag_added で本シナリオが自動 enroll（Day0）。
  - **診断分岐なし**（心電図ルートのような `{{type_tip}}` / `{{metadata.diagnosis_label}}` 差し込みは使わない）。全員同一本文の7日教育型。
- `delivery_mode`: `relative`（前ステップからの相対・分）
- `is_active`: 1（cron 5分毎で配信。**ただし B1 時間帯ガード JST21:00〜翌8:00 禁止が適用される**）

## 配信タイミング（心電図ルートと同一カレンダー）

| step_order | 役割 | delay_minutes（前ステップから） | カレンダー |
|---|---|---|---|
| 1 | Day0 乗船・循環器ルート案内 | 0 | Day0 |
| 2 | Day1 この船と仲間 | 1440 | Day1 |
| 3 | Day2 船長が船を出した理由 | 1440 | Day2 |
| 4 | Day3 前負荷・後負荷の超ざっくり理解（クイズ） | 1440 | Day3 |
| 5 | Day5 クルー限定の灯り＝循環器の勉強会・コンテンツ | 2880 | Day5 |
| 6 | Day6 仲間に吹いた風 | 1440 | Day6 |
| 7 | Day7 次の出航へのご案内 | 1440 | Day7 |

> Day4 は枠なし（心電図ルートと同じ。Day3→Day5 は 2880 分＝2日間隔）。

---

## ステップ本文（D1 と一致させる正本ミラー）

### Day0（step_order 1）
```
ようこそ、beナビへ🫀
「循環器を学びたい」を選んでくれて、ありがとうございます。循環器を一緒に学ぶ仲間が、また一人増えてうれしいです。

循環器って、心電図・心不全・血圧・ポンプ機能……ぜんぶがつながっていて、現場では「結局どこから手をつければ？」となりがちですよね。ここは、その“つながり”を、全国のナースと一緒に、基礎から体系的にほどいていく場所です。一人で抱えなくて大丈夫。ここには仲間がいます。

これから1週間、循環器を「なんとなく」から「自分の言葉で説明できる」へ近づくきっかけを、毎日ひとつずつお届けしますね。肩の力を抜いて、ついてきてください😊

——ベッカミ（看護師／心臓カテ室20年）
※配信は教育・学習目的です。診断・治療判断には用いないでください。
```

### Day1（step_order 2）
```
beナビでは毎週、ナースたちがZoomに集まって、心臓や循環器のことを語り合っています。
「この患者さんの血圧、なんで下がったんだろう」——そんな現場の“なぜ”を、みんなで持ち寄る場所です。堅い勉強会じゃありません。むしろ“部活”みたいな空気☺️

循環器は、一人で教科書と向き合うとどうしても孤独になりがち。でも、ここでは「それ、私も分からなかった」と言える仲間がいます。
見るだけ参加も大歓迎。あなたのペースで、ゆっくり仲間になってくれたらうれしいです。

明日は「なぜ、beナビをつくったのか」をお話しします。
——ベッカミ
```

### Day2（step_order 3）
```
なぜ、beナビをつくったのか。

僕は看護師として20年、心臓カテーテル室で循環器と向き合ってきました。
現場で痛感したのは——循環器の知識が「ある」人は増えても、「使える・語れる」人は驚くほど少ないこと。そして何より、みんな一人で、孤独に学んでいたことです。

参考書は教えてくれる。でも「これで合ってる？」を聞ける仲間はいない。続かない。もったいない。

だから決めました。ナースが循環器を通してつながり、語り合える場所をつくろう、と。それがbe Navigatorです。

ここは“サービス”じゃなく“仲間の集まり”。あなたが入ってくれたことで、また一つ、循環器を語れる輪が広がりました。本当にありがとう。
——ベッカミ
```

### Day3（step_order 4）※前負荷・後負荷の超ざっくり理解
```
今日は循環器の“土台”をひとつ。前負荷と後負荷、ざっくりいきましょう！（教育目的）

Q.「前負荷」と「後負荷」、超ざっくり言うとどっち？
　A. 前負荷＝心臓に“入ってくる”血液の量／後負荷＝血液を“押し出す”ときの抵抗
　B. その逆

……考えてみてください🤔

―――――――――――
答え：A！
・前負荷（preload）＝心臓に戻ってきて、心室がふくらむときの“入ってくる量”。たくさん戻れば、それだけ強く押し出せる（フランク・スターリングの法則）。
・後負荷（afterload）＝押し出すときに立ち向かう“壁の高さ”。血圧が高い・血管が硬いと、心臓はそのぶん頑張らないといけない。

イメージは「入ってくる量（前）」と「出すときの壁（後）」。この2語が分かると、心不全も降圧薬も、ぐっと読み解きやすくなります。

beナビの勉強会は、いつもこんな空気です☺️
※教育目的。診断・治療は医師の判断に従ってください。
```

### Day5（step_order 5）※クルー限定の予告トーン／循環器の勉強会・コンテンツの具体
```
少しずつ、この船のことが分かってきてくれたでしょうか😊
今日は、船のいちばん奥——正式なクルーだけが集まる、特別な甲板のお話を。

beナビには、循環器を体系的に学べる勉強会やコンテンツがあります。前負荷・後負荷のような“土台”から、心不全・弁膜症・ポンプ機能まで、現場でつながる形で一歩ずつ。
さらに、毎晩21:30からの勉強会（週5回）と、そのアーカイブ236本以上が、クルーになれば好きな時に好きなだけ見放題。「今日のあの患者さん」を持ち帰って、翌日には仲間と語れる——そんな学び方ができます。

ここは、クルーになると開く“港”。同じ海をめざす仲間が、全国で待っています。
いつか、この灯りの中で、あなたと話せる日を楽しみにしています。
——ベッカミ
```

### Day6（step_order 6）
```
beナビをやっていて、よく聞くのはこんな声です。

・一人だと続かなかった循環器が、仲間がいると「楽しい」に変わった、という声。
・現場で患者さんの状態を見て、自信を持って判断を口にできるようになった、という声。
・質問しても笑われず、むしろ一緒に考えてもらえる——その安心感がうれしい、という声。

学びは、一人より仲間とのほうが、ずっと遠くまで続きます。
あなたも、こちら側で一緒に学びませんか？
——ベッカミ
※上記はコミュニティでよく見られる傾向をまとめたもので、特定個人の発言ではありません。
```

### Day7（step_order 7）※直接チェックアウト導線
```
ここまで読んでくれてありがとう。あなたはもう、立派なbeナビの仲間です🫀

もし「もっと深く、仲間と一緒に循環器を学びたい」と思ってくれたら——beナビ正式メンバー（月2,000円）はこちらです。
・週5回（毎晩21:30〜90分）のZoom勉強会と、アーカイブ236本以上が見放題
・前負荷・後負荷から心不全まで、循環器を体系的に学べる勉強会とコンテンツ
・Discordで全国の仲間と、いつでも語り合える

カメラオフOK・聞くだけの参加も大歓迎。毎月1日は「スタート組」——新しい仲間と同じ場所から、一緒に漕ぎ出せます。

続けやすさを大事にしているので、合わなければ、いつでも自分のペースに戻って大丈夫。まずは一歩だけ、こちらからどうぞ👇
https://be-navigator.com/membership-checkout/?level=1
——ベッカミ
```

---

## 適用 SQL（INSERT）— ✅ 2026-06-27 D1 投入済

> この INSERT は **2026-06-27 に live D1（line-harness）へ適用済**（リポ同梱の [circ_onboarding.sql](../circ_onboarding.sql) が投入した実体）。下記は記録用。再適用は不要（再投入すると PRIMARY KEY 衝突）。
> 適用前に満たした条件（記録）：
> 1. ✅ **T1 deploy 済み**（live worker Version `a1a148de-cad3-4cea-b550-f39eef014216`）。
> 2. ✅ 適用直前の D1 フルバックアップ取得（`/tmp/benavi/d1_full_20260627-093600.sql`・揮発注意）。
> 3. ✅ 本文のオーナー文面レビュー（5観点）反映済。
> 4. ✅ `trigger_tag_id` の `c17ecb3c…`（R:循環器）が D1 に存在（事前検証クエリで確認）。

```sql
-- ============================================================
-- circ (循環器) onboarding — scenario 1 行
-- ============================================================
INSERT INTO scenarios (id, name, description, trigger_type, trigger_tag_id, is_active, delivery_mode)
VALUES (
  'c0cc3d89-cd8e-4f36-9734-3e291076e3ca',
  '循環器ルート オンボーディング（7日間）',
  'Hubで「循環器」選択→R:循環器付与→tag_addedで自動起動。7日教育型・診断分岐なし。',
  'tag_added',
  'c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57',
  1,
  'relative'
);

-- ============================================================
-- circ onboarding — scenario_steps 7 行（message_type は全て text）
-- 本文中のシングルクオートは無し（SQL エスケープ不要）。本文は上記「ステップ本文」と一致。
-- ============================================================
INSERT INTO scenario_steps (id, scenario_id, step_order, delay_minutes, message_type, message_content)
VALUES
('14875a89-f807-4374-a8ae-a5b544e6db88','c0cc3d89-cd8e-4f36-9734-3e291076e3ca',1,0,   'text','【Day0本文をここに格納】'),
('d88771c7-1bdd-46ef-85dd-03939c58bd6f','c0cc3d89-cd8e-4f36-9734-3e291076e3ca',2,1440,'text','【Day1本文をここに格納】'),
('1a72af9e-3ff6-4b0c-bdd1-ed90463407b6','c0cc3d89-cd8e-4f36-9734-3e291076e3ca',3,1440,'text','【Day2本文をここに格納】'),
('f638e450-c6e2-4d66-86a7-d73fe42e3932','c0cc3d89-cd8e-4f36-9734-3e291076e3ca',4,1440,'text','【Day3本文をここに格納】'),
('695cfb11-684b-4f7f-8a62-d775d9f85f4e','c0cc3d89-cd8e-4f36-9734-3e291076e3ca',5,2880,'text','【Day5本文をここに格納】'),
('7a57d8b6-453c-4b22-8c96-bdfbe8bd0e6d','c0cc3d89-cd8e-4f36-9734-3e291076e3ca',6,1440,'text','【Day6本文をここに格納】'),
('530c6ee5-ce1d-4f13-8669-add6e33d809f','c0cc3d89-cd8e-4f36-9734-3e291076e3ca',7,1440,'text','【Day7本文をここに格納】');
```

> 📌 上の VALUES の `【DayN本文をここに格納】` は、**本文に改行が多く SQL を一行で持つと壊れやすい/レビューしづらいため、プレースホルダにしてある**。
> 実適用時の推奨：上記「ステップ本文」の各 Day をそのまま `message_content` に流し込んだ `.sql` ファイルを別途生成し、`wrangler d1 execute --file` で投入する（前回 9-C / A・B 適用と同じ手順）。本文確定後に Codex へ「この md のステップ本文で INSERT 用 .sql を生成」と委譲するのが安全。

### 事前検証クエリ（適用前・読み取りのみ）
```sql
-- R:循環器 タグの存在確認（1 行返ればOK）
SELECT id, name FROM tags WHERE id='c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57';
-- 同一 scenario_id が未投入であることの確認（0 行ならOK）
SELECT id FROM scenarios WHERE id='c0cc3d89-cd8e-4f36-9734-3e291076e3ca';
```

---

## export 手順（適用直前バックアップ・2026-06-27 実施済）

> live D1 名・bindings は wrangler 設定に従う（実コマンドは適用担当が確認のうえ実行）。
```bash
# 1) 関連テーブルだけ JSON で退避（適用直前に実行）
wrangler d1 execute <DB_NAME> --remote --json \
  --command "SELECT * FROM scenarios WHERE id='c0cc3d89-cd8e-4f36-9734-3e291076e3ca';" \
  > /tmp/benavi/circ_pre_scenarios.json
wrangler d1 execute <DB_NAME> --remote --json \
  --command "SELECT * FROM scenario_steps WHERE scenario_id='c0cc3d89-cd8e-4f36-9734-3e291076e3ca';" \
  > /tmp/benavi/circ_pre_steps.json
# 2) （任意）full export
wrangler d1 export <DB_NAME> --remote --output /tmp/benavi/d1_full_$(date +%Y%m%d_%H%M).sql
```
> 投入前は scenarios/steps とも 0 行のはず（新規 UUID のため）。よって実質ロールバックは「入れたものを消す」だけで足りる。

## 適用手順（2026-06-27 実施済の記録）

実際に踏んだ手順（再適用ではなく履歴）：
1. ✅ T1 deploy（`pnpm --filter worker run deploy` を **main** から実施）→ live worker Version `a1a148de-cad3-4cea-b550-f39eef014216`。
2. ✅ 事前検証クエリで R:循環器 タグ存在＋ circ scenario 未投入（0 行）を確認。
3. ✅ フルバックアップ取得（`wrangler d1 export line-harness --remote` → `/tmp/benavi/d1_full_20260627-093600.sql`）。
4. ✅ `wrangler d1 execute line-harness --remote --file circ_onboarding.sql` 投入（`changed_db: true`）。
5. ✅ 投入後検証：scenario 1 行・steps 7 行・順序 1..7・delay `0/1440/1440/1440/2880/1440/1440`・`tag_added` active = ecg + circ の 2 本。
6. ✅ circ E2E（テストユーザー限定）：Hub「循環器」→ R:循環器付与 → 自動 enroll → **Day0 のみ届く**（intro Push 抑制＝T1 効果・二重 Push なし）を実機確認。詳細は末尾「更新履歴」。

## ロールバック SQL（投入済シナリオを撤去する場合）

```sql
-- circ シナリオと全ステップを削除（steps は ON DELETE CASCADE だが明示削除も可）
DELETE FROM scenario_steps WHERE scenario_id='c0cc3d89-cd8e-4f36-9734-3e291076e3ca';
DELETE FROM scenarios      WHERE id='c0cc3d89-cd8e-4f36-9734-3e291076e3ca';
-- ※ 既に friend がこの scenario に enroll されている場合は friend_scenarios も要確認：
-- SELECT id,friend_id,status FROM friend_scenarios WHERE scenario_id='c0cc3d89-cd8e-4f36-9734-3e291076e3ca';
-- （ON DELETE CASCADE で friend_scenarios 行も消えるが、E2E 後の停止手順は心電図と同様に status=completed 化を推奨）
```

---

## 関連 docs の追従（TODO）

- ⬜ `beNavigator_CRM_V1_1_implementation_plan.md` のシナリオ一覧（circ 行が「（V1.2）」のままの箇所）を
  `circulation-onboarding | c0cc3d89-cd8e-4f36-9734-3e291076e3ca | tag_added | R:循環器=c17ecb3c-… | 7 | 2026-06-27 稼働開始` へ更新（別 PR でも可）。
- ✅ 本ファイル冒頭の「案・未適用」表記は撤去し、「本番稼働中」＋下記「更新履歴」へ適用記録を反映済。

## 更新履歴（D1 への適用記録）

> 本シナリオの trigger / 文面など D1 側の変更は、適用日とともにここへ記録する（正本ミラー運用）。

- **2026-06-27 — 新規作成・D1 投入・本番稼働開始・実機 E2E 成功**
  - 投入：`circ_onboarding.sql`（`INSERT INTO scenarios` 1 行 ＋ `scenario_steps` 7 行）を `wrangler d1 execute line-harness --remote --file` で適用（`changed_db: true`）。SQL 生成は Codex 委譲 → Claude レビュー合格。
  - 前提：T1（route-select 二重メッセージ対策）を **main から deploy** 済 → live worker Version `a1a148de-cad3-4cea-b550-f39eef014216`（旧 `e0141a92`）。
  - バックアップ：`/tmp/benavi/d1_full_20260627-093600.sql`（適用直前のフルエクスポート・揮発注意）。
  - E2E（テストユーザー Koji Mano 限定・実 LINE 送信）：Hub「循環器」→ route-select 200（nextPage=null）→ **R:循環器＋I:循環器付与・circ enrollment 作成・直後の新規 outgoing 0 件＝intro Push 抑制成功**（T1 効果）→ cron(*/5) で **Day0 が 1 通だけ実送信**（step_order 1・「ようこそ、beナビへ🫀」・**二重 Push なし**）→ enrollment は order1/Day1 予定へ前進 → **検証後 status=completed / next_delivery_at=NULL で停止**。他ユーザー未波及・全体 active/delivering=0。
  - ロールバック（必要時）：上記「ロールバック SQL」で scenario と steps を削除（`ON DELETE CASCADE` で `friend_scenarios` も削除）。worker 側は前 Version へロールバック可。
