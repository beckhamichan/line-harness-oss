import {
  getBroadcastById,
  updateBroadcastStatus,
  jstNow,
  updateBroadcastLineRequestId,
  createBroadcastInsight,
} from '@line-crm/db';
import type { Broadcast } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import { calculateStaggerDelay, sleep } from './stealth.js';
import { buildSegmentQuery } from './segment-query.js';
import type { SegmentCondition } from './segment-query.js';
import {
  addBatchMessageVariations,
  autoTrackBroadcastMessages,
  buildMessages,
  createBroadcastMessageLogStatements,
  getEffectiveBroadcastMessages,
} from './broadcast.js';
import { assertDeliveryAllowed } from './delivery-window.js';

const MULTICAST_BATCH_SIZE = 500;

interface FriendRow {
  id: string;
  line_user_id: string;
}

export async function processSegmentSend(
  db: D1Database,
  lineClient: LineClient,
  broadcastId: string,
  condition: SegmentCondition,
  workerUrl?: string,
): Promise<Broadcast> {
  // 送信時ガード（ISSUE-0080）: status を動かす前に判定する。
  // この経路は現状どこからも呼ばれていないが、繋いだ瞬間に穴になるので塞いでおく。
  assertDeliveryAllowed();

  // Mark as sending
  await updateBroadcastStatus(db, broadcastId, 'sending');

  const broadcast = await getBroadcastById(db, broadcastId);
  if (!broadcast) {
    throw new Error(`Broadcast ${broadcastId} not found`);
  }

  const sourceMessages = await getEffectiveBroadcastMessages(db, broadcast);
  const trackedMessages = await autoTrackBroadcastMessages(db, sourceMessages, workerUrl);
  const broadcastAccountId = (broadcast as unknown as Record<string, unknown>).line_account_id as string | null;
  let liffId: string | null = null;
  if (broadcastAccountId) {
    const { getLineAccountById } = await import('@line-crm/db');
    const account = await getLineAccountById(db, broadcastAccountId);
    liffId = (account as unknown as { liff_id?: string | null } | null)?.liff_id ?? null;
  }
  const messages = buildMessages(trackedMessages, liffId);

  let totalCount = 0;
  let successCount = 0;

  try {
    // Build and execute segment query to get matching friends (アカウントで絞り込み)
    const { sql, bindings } = buildSegmentQuery(condition);
    let finalSql = sql;
    const finalBindings = [...bindings];
    if (broadcastAccountId) {
      finalSql = sql.replace('WHERE', 'WHERE f.line_account_id = ? AND');
      finalBindings.unshift(broadcastAccountId);
    }
    const queryResult = await db
      .prepare(finalSql)
      .bind(...finalBindings)
      .all<FriendRow>();

    const friends = queryResult.results ?? [];
    totalCount = friends.length;

    const now = jstNow();
    const totalBatches = Math.ceil(friends.length / MULTICAST_BATCH_SIZE);
    const unit = `bcast_${broadcast.id.slice(0, 8)}`;

    for (let i = 0; i < friends.length; i += MULTICAST_BATCH_SIZE) {
      const batchIndex = Math.floor(i / MULTICAST_BATCH_SIZE);
      const batch = friends.slice(i, i + MULTICAST_BATCH_SIZE);
      const lineUserIds = batch.map((f) => f.line_user_id);

      // Stealth: stagger delays between batches
      if (batchIndex > 0) {
        const delay = calculateStaggerDelay(friends.length, batchIndex);
        await sleep(delay);
      }

      const batchMessages = addBatchMessageVariations(messages, batchIndex, totalBatches);

      try {
        await lineClient.multicast(lineUserIds, batchMessages, [unit]);
        successCount += batch.length;

        // Log successfully sent messages (batch insert for performance)
        // line_account_id は broadcast 設定時の固定値を記録 (送信時点のチャネル).
        const segmentBroadcastAccount = (broadcast as unknown as Record<string, unknown>).line_account_id as string | null;
        const logStmts = createBroadcastMessageLogStatements(db, batch, batchMessages, {
          broadcastId,
          lineAccountId: segmentBroadcastAccount,
          createdAt: now,
        });
        await db.batch(logStmts);
      } catch (err) {
        console.error(`Segment multicast batch ${batchIndex} failed:`, err);
        // Continue with next batch; failed batch is not logged
      }
    }

    await updateBroadcastLineRequestId(db, broadcast.id, null, unit);
    await createBroadcastInsight(db, broadcast.id);
    await updateBroadcastStatus(db, broadcastId, 'sent', { totalCount, successCount });
  } catch (err) {
    // On failure, reset to draft so it can be retried
    await updateBroadcastStatus(db, broadcastId, 'draft');
    throw err;
  }

  return (await getBroadcastById(db, broadcastId))!;
}

// Message building is imported from ./broadcast.js (single source of truth).
