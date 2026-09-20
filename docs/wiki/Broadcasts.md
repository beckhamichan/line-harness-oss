# Broadcasts — 一斉配信

## 概要

一斉配信（ブロードキャスト）は、友だち全員またはタグ/セグメントで絞り込んだ対象にメッセージを一括送信する機能です。1件の配信に、順序つきの `text` / `image` / `flex` メッセージを1〜5件登録できます。下書き保存、予約配信、セグメント配信、複数アカウント重複除外配信に対応しています。

保存したメッセージは、手動送信、予約配信、500人超の分割送信、複数アカウント重複除外、セグメント送信、テスト送信のすべてで、各送信バッチの1回のLINE APIリクエストへ同じ順序でまとめられます。URL自動計測、`{{liff_id}}` 置換、Flexの `altText` はメッセージごとに適用されます。

## データモデル

### broadcasts テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT (UUID) | 主キー |
| `title` | TEXT | 配信タイトル（管理用） |
| `message_type` | TEXT | 先頭メッセージの種類（旧API互換ミラー） |
| `message_content` | TEXT | 先頭メッセージの内容（旧API互換ミラー） |
| `alt_text` | TEXT | 先頭メッセージの代替テキスト（旧API互換ミラー） |
| `target_type` | TEXT | `all` / `tag` / `multi-account-dedup` |
| `target_tag_id` | TEXT | tag 指定時のタグID |
| `status` | TEXT | `draft` / `scheduled` / `sending` / `sent` |
| `scheduled_at` | TEXT | 予約配信日時 (JST, null = 即時) |
| `sent_at` | TEXT | 実際の配信完了日時 (JST) |
| `total_count` | INTEGER | 配信対象数 |
| `success_count` | INTEGER | 配信成功数 |
| `created_at` | TEXT | 作成日時 (JST) |

### broadcast_messages テーブル

順序つきメッセージの正本です。`broadcasts.message_type` / `message_content` / `alt_text` は、後方互換のためposition 0の内容をミラーします。

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT | 主キー |
| `broadcast_id` | TEXT | `broadcasts.id`。親削除時にCASCADE削除 |
| `position` | INTEGER | 送信順（0〜4、配信内で一意） |
| `message_type` | TEXT | `text` / `image` / `flex` |
| `message_content` | TEXT | メッセージ内容 |
| `alt_text` | TEXT | Flex代替テキスト（任意） |
| `created_at` | TEXT | 作成日時 (JST) |

受信者を特定できる配信経路では、`messages_log` が受信者ごと・メッセージごとに1行を保存します。`message_index` は配信内の順序（0〜4）で、一斉配信以外のログでは `NULL` です。

### API レスポンス形式

```json
{
  "id": "broadcast-uuid",
  "title": "3月キャンペーンのお知らせ",
  "messageType": "text",
  "messageContent": "本日限定のお知らせです。",
  "altText": null,
  "messages": [
    {
      "type": "text",
      "content": "本日限定のお知らせです。",
      "altText": null
    },
    {
      "type": "image",
      "content": "{\"originalContentUrl\":\"https://example.com/sale.jpg\",\"previewImageUrl\":\"https://example.com/sale-preview.jpg\"}",
      "altText": null
    },
    {
      "type": "text",
      "content": "詳しくはこちら: https://example.com/sale",
      "altText": null
    }
  ],
  "targetType": "tag",
  "targetTagId": "vip-tag-uuid",
  "status": "sent",
  "scheduledAt": null,
  "sentAt": "2026-03-23T14:00:00.000+09:00",
  "totalCount": 250,
  "successCount": 248,
  "createdAt": "2026-03-23T13:50:00.000+09:00"
}
```

`messageType` / `messageContent` / `altText` は常に `messages[0]` の互換ミラーです。新しいクライアントは `messages` を正本として扱ってください。`broadcast_messages` が空の旧データは、親行の互換フィールドから1件の `messages` として返されます。

## 管理画面

新規配信画面では、メッセージを最大5件まで追加し、各メッセージの種類・内容・Flex代替テキストを個別に編集できます。上矢印・下矢印で送信順を変更でき、不要なメッセージは削除できます。ただし最後の1件は削除できません。

各メッセージには個別プレビューが表示されます。一覧画面は複数メッセージの件数を、詳細画面は保存順にすべてのメッセージを表示します。

## ステータスライフサイクル

```
draft ──────────────────────────┐
  │                              │
  │ scheduledAt を設定           │ POST /:id/send
  ▼                              │
scheduled ──────────────────────┤
  │                              │
  │ Cron: scheduled_at <= now    │
  ▼                              ▼
sending ───────────────────────►
  │
  │ 全バッチ完了
  ▼
sent
```

| ステータス | 意味 | 編集可 | 削除可 |
|-----------|------|--------|--------|
| `draft` | 下書き | はい | はい |
| `scheduled` | 予約済み | はい | はい |
| `sending` | 配信中 | いいえ | いいえ |
| `sent` | 配信完了 | いいえ | いいえ |

- `scheduledAt` を設定すると自動的に `scheduled` になる
- `scheduledAt` を null に戻すと `draft` に戻る
- 配信失敗時は `draft` にリセットされ、再試行可能

## バッチ送信メカニズム

### target_type: 'all'

LINE の `broadcast` API を使用（全フォロワーに送信）:

```typescript
await lineClient.broadcast(messages); // 保存順の1〜5件
```

- LINE Messaging API のブロードキャスト機能を使用
- 正確な送信数は取得不可（total_count = 0）
- 最もシンプルで高速

### target_type: 'tag'

`multicast` API を使用（500件ずつバッチ送信）:

```typescript
const MULTICAST_BATCH_SIZE = 500;

for (let i = 0; i < friends.length; i += 500) {
  const batch = friends.slice(i, i + 500);
  const lineUserIds = batch.map(f => f.line_user_id);

  // ステルス遅延
  if (batchIndex > 0) {
    const delay = calculateStaggerDelay(totalMessages, batchIndex);
    await sleep(delay);
  }

  // メッセージバリエーション（配列内のテキストに適用）
  const batchMessages = addBatchMessageVariations(messages, batchIndex, totalBatches);

  await lineClient.multicast(lineUserIds, batchMessages);
}
```

複数メッセージは吹き出しごとに別リクエストへ分割しません。バッチごとに1つの `messages` 配列として渡すため、同一バッチ内で一部のメッセージだけ送られる状態を避けます。

### ステルス遅延計算

| 対象人数 | バッチ間遅延 |
|---------|------------|
| ~100人 | 100〜600ms |
| ~1,000人 | ~2分間に均等分散 + 2sジッター |
| 1,000人以上 | ~5分間に均等分散 + 5sジッター |

### メッセージバリエーション

テキストメッセージの場合、バッチごとにゼロ幅文字を挿入して微妙に異なるメッセージにします:

```typescript
// ゼロ幅スペース群（視覚的に見えない）
'\u200B'  // zero-width space
'\u200C'  // zero-width non-joiner
'\u200D'  // zero-width joiner
'\uFEFF'  // zero-width no-break space
```

## セグメント配信

タグだけでなく、複数条件の組み合わせで対象を絞り込む高度な配信:

### SegmentCondition 構造

```typescript
interface SegmentCondition {
  operator: 'AND' | 'OR'
  rules: SegmentRule[]
}

interface SegmentRule {
  type: 'tag_exists' | 'tag_not_exists' | 'metadata_equals' | 'metadata_not_equals' | 'ref_code' | 'is_following'
  value: string | boolean | { key: string; value: string }
}
```

### ルールタイプ一覧

| type | value | 説明 |
|------|-------|------|
| `tag_exists` | タグID (string) | そのタグを持つ友だち |
| `tag_not_exists` | タグID (string) | そのタグを持たない友だち |
| `metadata_equals` | `{key, value}` | metadata.key == value |
| `metadata_not_equals` | `{key, value}` | metadata.key != value |
| `ref_code` | ref_code (string) | 流入元コード一致 |
| `is_following` | boolean | フォロー中かどうか |

### SQL 生成

`buildSegmentQuery()` が条件をSQLに変換:

```sql
-- AND の場合
SELECT f.id, f.line_user_id FROM friends f
WHERE EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = f.id AND ft.tag_id = ?)
  AND json_extract(f.metadata, '$.plan') = ?
  AND f.is_following = 1

-- OR の場合
SELECT f.id, f.line_user_id FROM friends f
WHERE EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = f.id AND ft.tag_id = ?)
  OR json_extract(f.metadata, '$.plan') = ?
```

## API エンドポイント

### GET /api/broadcasts — 配信一覧

```bash
curl -s "https://your-worker.your-subdomain.workers.dev/api/broadcasts" \
  -H "Authorization: Bearer YOUR_API_KEY" | jq
```

レスポンス:

```json
{
  "success": true,
  "data": [
    {
      "id": "broadcast-uuid-1",
      "title": "VIPセール告知",
      "messageType": "text",
      "messageContent": "VIP限定30%OFF！",
      "altText": null,
      "messages": [
        { "type": "text", "content": "VIP限定30%OFF！", "altText": null }
      ],
      "targetType": "tag",
      "targetTagId": "vip-tag-uuid",
      "status": "sent",
      "scheduledAt": null,
      "sentAt": "2026-03-23T14:00:00.000+09:00",
      "totalCount": 50,
      "successCount": 50,
      "createdAt": "2026-03-23T13:50:00.000+09:00"
    },
    {
      "id": "broadcast-uuid-2",
      "title": "来週のイベント案内",
      "messageType": "flex",
      "messageContent": "{...}",
      "altText": "来週のイベント案内",
      "messages": [
        { "type": "flex", "content": "{...}", "altText": "来週のイベント案内" }
      ],
      "targetType": "all",
      "targetTagId": null,
      "status": "scheduled",
      "scheduledAt": "2026-03-25T10:00:00.000+09:00",
      "sentAt": null,
      "totalCount": 0,
      "successCount": 0,
      "createdAt": "2026-03-23T12:00:00.000+09:00"
    }
  ]
}
```

### GET /api/broadcasts/:id — 配信詳細

```bash
curl -s "https://your-worker.your-subdomain.workers.dev/api/broadcasts/BROADCAST_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY" | jq
```

### POST /api/broadcasts — 配信作成

```bash
# 最大5件の複数メッセージ配信（保存順に送信）
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/broadcasts" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "セール告知",
    "messages": [
      {
        "type": "text",
        "content": "本日限定のお知らせです。"
      },
      {
        "type": "image",
        "content": "{\"originalContentUrl\":\"https://example.com/sale.jpg\",\"previewImageUrl\":\"https://example.com/sale-preview.jpg\"}"
      },
      {
        "type": "flex",
        "content": "{\"type\":\"bubble\",\"body\":{\"type\":\"box\",\"layout\":\"vertical\",\"contents\":[{\"type\":\"text\",\"text\":\"詳しく見る\"}]}}",
        "altText": "セールの詳細"
      }
    ],
    "targetType": "all"
  }'

# 旧API互換の1メッセージ作成も引き続き利用可能
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/broadcasts" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "VIPセール告知",
    "messageType": "text",
    "messageContent": "VIP会員限定！本日限り30%OFF！",
    "targetType": "tag",
    "targetTagId": "VIP_TAG_UUID",
    "scheduledAt": "2026-03-24T10:00:00.000+09:00"
  }'
```

リクエストボディ:

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `title` | string | 必須 | 管理用タイトル |
| `messages` | array | 条件付き | 新形式。順序つき1〜5件。0件・6件以上は400 |
| `messages[].type` | string | 必須 | `text` / `image` / `flex` |
| `messages[].content` | string | 必須 | 空白以外を含むメッセージ内容 |
| `messages[].altText` | string \| null | 任意 | Flex代替テキスト |
| `messageType` | string | 条件付き | 旧形式。`messages` 未指定時に `messageContent` と組で必須 |
| `messageContent` | string | 条件付き | 旧形式の単一メッセージ内容 |
| `altText` | string \| null | 任意 | 旧形式のFlex代替テキスト |
| `targetType` | string | 必須 | `all` / `tag` / `multi-account-dedup` |
| `targetTagId` | string | 条件付き | 単一タグ指定、または重複除外配信の任意タグ |
| `targetTagIds` | string[] | 条件付き | `targetType=tag` のタグ集合（OR条件） |
| `accountIds` | string[] | 条件付き | `multi-account-dedup` で必須 |
| `dedupPriority` | string[] | 条件付き | `multi-account-dedup` で必須。空配列可 |
| `scheduledAt` | string | 任意 | 予約日時 (JST)。null = draft |

レスポンス (201):

```json
{
  "success": true,
  "data": {
    "id": "new-broadcast-uuid",
    "title": "お知らせ",
    "messageType": "text",
    "messageContent": "こんにちは！",
    "altText": null,
    "messages": [
      { "type": "text", "content": "こんにちは！", "altText": null }
    ],
    "targetType": "all",
    "targetTagId": null,
    "status": "draft",
    "scheduledAt": null,
    "sentAt": null,
    "totalCount": 0,
    "successCount": 0,
    "createdAt": "2026-03-23T15:00:00.000+09:00"
  }
}
```

### PUT /api/broadcasts/:id — 配信更新

draft または scheduled の配信のみ更新可能:

```bash
curl -X PUT "https://your-worker.your-subdomain.workers.dev/api/broadcasts/BROADCAST_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "更新後のタイトル",
    "messages": [
      { "type": "text", "content": "更新後の導入文" },
      { "type": "text", "content": "更新後の申込導線" }
    ],
    "scheduledAt": "2026-03-25T18:00:00.000+09:00"
  }'
```

- メッセージを変更するときは、変更後の配列全体を `messages` へ指定する
- 複数メッセージが保存された配信を旧フィールドだけで更新すると、意図せず1件へ縮むことを防ぐため400エラー
- 単一メッセージの配信では、旧フィールドによる更新も引き続き利用可能
- `scheduledAt` を設定 → status は `scheduled` に自動変更
- `scheduledAt` を null に設定 → status は `draft` に自動変更
- `sending` / `sent` の配信は更新不可（400エラー）

### DELETE /api/broadcasts/:id — 配信削除

```bash
curl -X DELETE "https://your-worker.your-subdomain.workers.dev/api/broadcasts/BROADCAST_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/broadcasts/:id/send — 即時配信

下書きまたは予約中の配信を即座に実行:

```bash
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/broadcasts/BROADCAST_UUID/send" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

- `sending` / `sent` の場合は 400 エラー
- 配信失敗時は status が `draft` にリセット（再試行可）
- 1〜5件すべてを保存順の1回のLINE APIリクエストとして送信

### POST /api/broadcasts/:id/send-segment — セグメント配信

複数条件を組み合わせた対象に配信:

```bash
# VIPタグを持ち、かつ metadata.plan が "premium" の友だちに配信
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/broadcasts/BROADCAST_UUID/send-segment" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "conditions": {
      "operator": "AND",
      "rules": [
        { "type": "tag_exists", "value": "VIP_TAG_UUID" },
        { "type": "metadata_equals", "value": { "key": "plan", "value": "premium" } },
        { "type": "is_following", "value": true }
      ]
    }
  }'

# タグAまたはタグBを持つ友だちに配信
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/broadcasts/BROADCAST_UUID/send-segment" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "conditions": {
      "operator": "OR",
      "rules": [
        { "type": "tag_exists", "value": "TAG_A_UUID" },
        { "type": "tag_exists", "value": "TAG_B_UUID" }
      ]
    }
  }'
```

手動、予約、500人超の分割、複数アカウント重複除外、セグメント、テスト送信の各経路は、いずれも同じ `messages` 配列を使用します。`broadcast_messages` に行がない旧データでは、親行の互換フィールドから単一メッセージを組み立てます。

## 配信禁止時間帯

JST 23:00〜翌7:00は一斉配信を行いません。

- 禁止時間帯を指定した予約作成・更新は400エラー
- 禁止時間帯の手動送信・テスト送信は、送信前に拒否
- Cronは禁止時間帯に予約配信を取得せず、7:00以降の実行へ持ち越す
- 分割送信・複数アカウント重複除外ではバッチ境界でも再確認し、未送信分だけを7:00以降へ持ち越す
- メッセージ数によってガードの位置や判定時刻は変わらない

## 予約配信の仕組み

1. `scheduledAt` を JST 文字列で設定 → status が `scheduled` に
2. Cron (5分毎) で `processScheduledBroadcasts()` が実行
3. `status='scheduled' AND scheduled_at <= now` の配信を検出
4. `processBroadcastSend()` を実行

注意: Cron は5分間隔のため、予約時刻から最大5分の遅延が発生する可能性があります。

## SDK 使用例

> 現在のSDK/MCPは旧形式の単一メッセージ作成・更新のみ対応しています。複数メッセージは管理画面またはHTTP APIの `messages` を使用してください。SDK/MCPの複数メッセージ対応はIssue #56で扱います。

```typescript
import { LineHarness } from '@line-harness/sdk'

const client = new LineHarness({
  apiUrl: 'https://your-worker.your-subdomain.workers.dev',
  apiKey: 'YOUR_API_KEY',
})

// === 低レベルAPI ===

// 配信作成（下書き）
const broadcast = await client.broadcasts.create({
  title: '月間セール',
  messageType: 'text',
  messageContent: '今月のセール情報です！',
  targetType: 'all',
})

// 予約配信
const scheduled = await client.broadcasts.create({
  title: '朝の挨拶',
  messageType: 'text',
  messageContent: 'おはようございます！',
  targetType: 'all',
  scheduledAt: '2026-03-24T08:00:00.000+09:00',
})

// 配信更新
await client.broadcasts.update(broadcast.id, {
  messageContent: '更新：今月のセール情報です！',
})

// 即時配信
const result = await client.broadcasts.send(broadcast.id)
console.log(`Sent: ${result.successCount}/${result.totalCount}`)

// セグメント配信
const segResult = await client.broadcasts.sendToSegment(broadcast.id, {
  operator: 'AND',
  rules: [
    { type: 'tag_exists', value: 'vip-tag-uuid' },
    { type: 'is_following', value: true },
  ],
})

// === 高レベルAPI ===

// 全員にテキスト配信（作成+送信を1ステップで）
await client.broadcastText('全員へのお知らせ')

// タグ指定で配信
await client.broadcastToTag('vip-tag-uuid', 'text', 'VIP限定メッセージ')

// セグメント指定で配信
await client.broadcastToSegment('text', 'フィルタ済みメッセージ', {
  operator: 'AND',
  rules: [
    { type: 'tag_exists', value: 'active-tag-uuid' },
    { type: 'metadata_equals', value: { key: 'plan', value: 'premium' } },
  ],
})
```

## 配信失敗時の挙動

| 状況 | 挙動 |
|------|------|
| multicast バッチ失敗 | そのバッチはスキップ、次バッチを続行 |
| 全体的な失敗 | status を `draft` にリセット（再試行可） |
| friend が unfollow 済み | `is_following=0` の友だちはタグ配信時に自動除外 |

配信失敗ログは Workers のコンソールログに出力されます。

## ロールアウトとロールバック

### ロールアウト順

1. migration 048を適用し、`broadcast_messages` と `messages_log.message_index` を追加
2. 複数メッセージ対応Workerを反映
3. 複数メッセージ対応の管理画面を反映

本番migration、deploy、LINEテスト送信・実送信は、Ownerの明示承認後だけ実施します。

### ロールバック条件

次のいずれかが確認された場合は、新規作成・送信を止めてロールバックを検討します。

- 保存順とAPIレスポンス順が一致しない
- 同一受信者へ同じ配信が二重送信される
- 1回の配信で一部のメッセージだけ送られる
- 既存の単一メッセージ配信が表示・編集・送信できない
- 禁止時間帯ガードが送信経路のいずれかで機能しない
- `messages_log` の `message_index` と実際の送信順が一致しない

### 安全なロールバック手順

1. 管理画面を旧版へ戻し、新しい複数メッセージ下書きが増えないようにする。
2. Workerを戻す前に、未完了の複数メッセージ配信を読み取り専用SQLで確認する。

   ```sql
   SELECT b.id, b.status, COUNT(bm.id) AS message_count
   FROM broadcasts b
   JOIN broadcast_messages bm ON bm.broadcast_id = b.id
   WHERE b.status IN ('draft', 'scheduled', 'sending')
   GROUP BY b.id, b.status
   HAVING COUNT(bm.id) >= 2;
   ```

3. `sending` が存在する場合はWorkerを即時ダウングレードせず、送信状態とログを確認する。再送すると二重送信になる可能性があるため、状態変更や再送はOwner判断で行う。
4. `draft` / `scheduled` の複数メッセージ配信は、旧Workerでは先頭メッセージしか扱えない。自動で1件へ縮めず、現行Workerを維持するか、配信停止・内容変更をOwnerが個別に決める。
5. Workerを旧版へ戻せる条件がそろった後にのみダウングレードする。親行の旧フィールドは先頭メッセージをミラーしているため、既存の単一メッセージ配信は継続できる。
6. migration 048は追加専用なので、緊急時も `broadcast_messages` テーブルや `message_index` 列を削除しない。旧コードは追加スキーマを無視でき、データを残したまま再ロールフォワードできる。

`broadcast_messages` が空の配信は、WorkerとAPIが `broadcasts.message_type` / `message_content` / `alt_text` から1件を復元します。行がある場合は `position` の昇順が正本です。位置の欠落や範囲外を調べるには次の読み取り専用SQLを使います。

```sql
SELECT broadcast_id,
       COUNT(*) AS message_count,
       MIN(position) AS first_position,
       MAX(position) AS last_position
FROM broadcast_messages
GROUP BY broadcast_id
HAVING COUNT(*) > 5
   OR MIN(position) <> 0
   OR MAX(position) <> COUNT(*) - 1;
```
