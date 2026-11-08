const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 2000;

// auto_reply にマッチした incoming は「人間対応不要」として未対応から除外する。
// 判定戦略は 2 系統:
//
// (A) 応答ありルール (response_type != 'silent'):
//     incoming 直後に source='auto_reply' delivery_type='reply' の outgoing が
//     messages_log に残っているかを「証拠」として確認する。ルール keyword が
//     後で書き換えられても歴史的判定がブレない。
//
// (B) keyword 一致 (応答なしルール / scope 外ルール / 古い証拠なし):
//     content がいずれかの active 自動返信 keyword と一致するなら、
//     button label / FAQ キーワードと見なして除外。
//     - response_type は問わない (応答ありルールも証拠が時間窓外/欠損な
//       ケースを救済)
//     - line_account_id scope は無視 (1アカに登録された button label を
//       別アカでも構造化メッセと判定)
//     - created_at による後付けルールガードも撤廃 (本番事故 2026-05-08 #2:
//       ルールが re-create されて created_at が新しくなると、古い incoming
//       が「ルール後付け」扱いされてフィルタを通り抜けていた。現実的には
//       button label / FAQ keyword は安定運用なので、現在の active キーワード
//       が一致したら歴史問わず構造化メッセと判定する。)
const ACTIVE_AUTO_REPLIES_SQL = `
  SELECT keyword, match_type
  FROM auto_replies
  WHERE is_active = 1
`;

interface ActiveRuleRow {
  keyword: string;
  match_type: string;
}

function matchesAnyKeyword(
  content: string,
  messageType: string,
  rules: ActiveRuleRow[],
): boolean {
  if (messageType !== 'text') return false;
  for (const ar of rules) {
    if (ar.match_type === 'exact' && ar.keyword === content) return true;
    if (ar.match_type === 'contains' && content.includes(ar.keyword)) return true;
  }
  return false;
}

// 同じ incoming に対して outgoing 'auto_reply' (delivery_type='reply') が
// 短時間内に発火していれば、この incoming は応答ありルールにマッチしたと判定する。
// 5 秒は webhook が auto_reply を送るまでの最大時間として保守的に取る。
const AUTO_REPLY_EVIDENCE_WINDOW_MS = 5_000;

/**
 * outgoing 1 件は incoming 1 件にしかマッチさせない。
 * 同じ友だちが短時間に複数メッセを送って auto_reply が 1 件しか飛ばないケース、
 * 古い free-form メッセが新しいマッチメッセの outgoing で誤判定される (codex
 * round 3 P1) のを防ぐ。consume 済み outgoing は配列から取り除く。
 */
function consumeAutoReplyEvidence(
  incomingAt: string,
  remainingOutgoings: { created_at: string }[],
): boolean {
  const inMs = new Date(incomingAt).getTime();
  for (let i = 0; i < remainingOutgoings.length; i++) {
    const outMs = new Date(remainingOutgoings[i].created_at).getTime();
    if (outMs >= inMs && outMs - inMs <= AUTO_REPLY_EVIDENCE_WINDOW_MS) {
      remainingOutgoings.splice(i, 1);
      return true;
    }
  }
  return false;
}

// 候補 friend のメタデータ + 集約タイムスタンプ。
// プレビュー/タイプは別クエリで last_manual 以降の incoming 群から JS で決める
// (auto_reply マッチを除いた「最新の非マッチ incoming」が triage 対象)。
// MAX を friend/direction の索引検索にする。期間の足切りはしない。
// MATERIALIZED により候補判定で最終時刻を再計算しない。
const CANDIDATES_SQL = (includeMachine: boolean) => `
  WITH agg AS MATERIALIZED (
    SELECT f.id AS friend_id, f.display_name, f.picture_url, f.line_account_id,
      COALESCE(la.name, '(未分類)') AS account_name,
      (SELECT MAX(created_at) FROM messages_log
       WHERE friend_id=f.id AND direction='incoming'
         AND (source IS NULL OR source != 'postback')) AS last_incoming,
      (SELECT MAX(created_at) FROM messages_log INDEXED BY idx_messages_log_friend_source
       WHERE friend_id=f.id AND direction='outgoing' AND source='manual') AS last_manual
    FROM friends f
    LEFT JOIN line_accounts la ON la.id = f.line_account_id
    WHERE f.is_following = 1 AND (la.id IS NULL OR la.is_active = 1)
  )
  SELECT agg.*,
    ${includeMachine ? `(SELECT MAX(created_at) FROM messages_log
     WHERE friend_id=agg.friend_id AND direction='outgoing'
       AND source IN ('auto_reply','automation','automation_backfill','scenario','broadcast'))` : 'NULL'} AS last_machine
  FROM agg
  WHERE last_incoming IS NOT NULL
    AND (last_manual IS NULL OR last_manual < last_incoming)
  ORDER BY last_incoming ASC, friend_id ASC
`;

// 旧SQLの昇順索引走査＋ソートと同じく、同時刻はrowid昇順を保つ。
// 候補ごとの索引検索を UNION ALL する。manual がある場合のみ時刻条件を付け、
// OR によって created_at の範囲検索が失われることを避ける。
const RECENT_INCOMINGS_SQL = `
  SELECT ml.friend_id AS friend_id, ml.message_type, ml.content, ml.created_at, ml.rowid AS _tie_order
  FROM last_manual lm CROSS JOIN messages_log ml
  WHERE ml.friend_id=lm.friend_id AND ml.direction='incoming'
    AND (ml.source IS NULL OR ml.source != 'postback')
`;
const RECENT_AUTO_REPLY_OUTGOINGS_SQL = `
  SELECT ml.friend_id AS friend_id, ml.created_at, ml.rowid AS _tie_order
  FROM last_manual lm CROSS JOIN messages_log ml
  WHERE ml.friend_id=lm.friend_id AND ml.direction='outgoing'
    AND ml.source='auto_reply' AND ml.delivery_type='reply'
`;

// JSON配列を1 bindで渡す。候補が100人を超えても変数上限や分割クエリ増に依存しない。
function prepareCandidateHistory(
  db: D1Database, sql: string, candidates: RawCandidateRow[], order: 'ASC' | 'DESC',
): D1PreparedStatement {
  // 候補取得後に手動返信が入る場合も、旧SQLと同様に各履歴SQLの時点で再確認。
  // 手動返信なし/ありを分け、後者ではcreated_atの範囲検索を使う。
  return db.prepare(`
    WITH last_manual AS MATERIALIZED (
      SELECT scope.value AS friend_id,
        (SELECT MAX(created_at) FROM messages_log INDEXED BY idx_messages_log_friend_source
         WHERE friend_id=scope.value AND direction='outgoing' AND source='manual') AS lm
      FROM json_each(?) AS scope
    )
    ${sql} AND lm.lm IS NULL
    UNION ALL
    ${sql} AND lm.lm IS NOT NULL AND ml.created_at > lm.lm
    ORDER BY friend_id, created_at ${order}, _tie_order ASC
  `).bind(JSON.stringify(candidates.map((c) => c.friend_id)));
}


export interface UnansweredRow {
  friendId: string;
  displayName: string | null;
  pictureUrl: string | null;
  accountId: string;
  accountName: string;
  lastIncomingAt: string;
  lastManualAt: string | null;
  lastMachineAt: string | null;
  lastIncomingType: string;
  lastIncomingContent: string;
}

export interface UnansweredInboxResult {
  total: number;
  page: number;
  pageSize: number;
  rows: UnansweredRow[];
}

export interface UnansweredCount {
  total: number;
  byAccount: Array<{ accountId: string; accountName: string; count: number }>;
  oldestWaitMinutes: number | null;
}

export interface UnansweredInboxOptions {
  q?: string;
  account?: string;
  minWaitMinutes?: number;
  page?: number;
  pageSize?: number;
}

interface RawCandidateRow {
  friend_id: string;
  display_name: string | null;
  picture_url: string | null;
  line_account_id: string;
  account_name: string;
  last_incoming: string;
  last_manual: string | null;
  last_machine: string | null;
}

interface RawIncomingRow {
  friend_id: string;
  message_type: string;
  content: string;
  created_at: string;
}

function applyFilters(rows: UnansweredRow[], opts: UnansweredInboxOptions): UnansweredRow[] {
  let filtered = rows;
  if (opts.account) {
    filtered = filtered.filter((r) => r.accountId === opts.account);
  }
  if (opts.minWaitMinutes && opts.minWaitMinutes > 0) {
    const cutoff = Date.now() - opts.minWaitMinutes * 60_000;
    filtered = filtered.filter((r) => new Date(r.lastIncomingAt).getTime() <= cutoff);
  }
  if (opts.q) {
    const q = opts.q.toLowerCase();
    filtered = filtered.filter((r) => {
      if (r.displayName?.toLowerCase().includes(q)) return true;
      if (r.lastIncomingContent.toLowerCase().includes(q)) return true;
      return false;
    });
  }
  return filtered;
}

/**
 * Single source of truth.
 *
 * 1. CANDIDATES_SQL で「last_incoming > last_manual」の friend を取る。
 * 2. 候補 friend に scope して "last_manual 以降の incoming" と "auto_reply outgoing" を取る。
 * 3. silent ルール一覧を取る (応答ありルールは outgoing 証拠で判定するので不要)。
 * 4. JS で各 incoming を判定: 応答あり証拠 OR silent ルール match で「マッチ済」、
 *    マッチしない最新の incoming を preview として採用。全部マッチした thread のみ除外。
 */
async function getAllUnansweredRows(db: D1Database, includeMachine = true): Promise<UnansweredRow[]> {
  const candidatesResult = await db.prepare(CANDIDATES_SQL(includeMachine)).all<RawCandidateRow>();
  const candidates = candidatesResult.results ?? [];
  if (candidates.length === 0) return [];

  // SQLでも候補に限定する。Setはgroup時の防御として残す。
  const candidateIds = new Set(candidates.map((c) => c.friend_id));

  const [incomingsResult, outgoingsResult, rulesResult] = await Promise.all([
    prepareCandidateHistory(db, RECENT_INCOMINGS_SQL, candidates, 'DESC').all<RawIncomingRow>(),
    prepareCandidateHistory(db, RECENT_AUTO_REPLY_OUTGOINGS_SQL, candidates, 'ASC')
      .all<{ friend_id: string; created_at: string }>(),
    db.prepare(ACTIVE_AUTO_REPLIES_SQL).all<ActiveRuleRow>(),
  ]);
  const incomingRows = incomingsResult.results ?? [];
  const outgoingRows = outgoingsResult.results ?? [];
  const activeRules = rulesResult.results ?? [];

  // friend_id ごとに incomings を集める (created_at DESC でソート済み)。
  // 候補外の friend のメッセは捨てる (memory 節約)。
  const incomingsByFriend = new Map<string, RawIncomingRow[]>();
  for (const row of incomingRows) {
    if (!candidateIds.has(row.friend_id)) continue;
    const list = incomingsByFriend.get(row.friend_id) ?? [];
    list.push(row);
    incomingsByFriend.set(row.friend_id, list);
  }
  // friend_id ごとに auto_reply outgoings を集める (created_at ASC ソート済み)。
  const autoReplyOutgoingsByFriend = new Map<string, { created_at: string }[]>();
  for (const row of outgoingRows) {
    if (!candidateIds.has(row.friend_id)) continue;
    const list = autoReplyOutgoingsByFriend.get(row.friend_id) ?? [];
    list.push({ created_at: row.created_at });
    autoReplyOutgoingsByFriend.set(row.friend_id, list);
  }

  const rows: UnansweredRow[] = [];
  for (const c of candidates) {
    const incomings = incomingsByFriend.get(c.friend_id) ?? [];
    // outgoings は consume するのでコピーを作る (元 Map の他参照を破壊しない)。
    // incomings は新しい順に処理し、各 outgoing を 1 incoming にしか割り当てない。
    const remainingOutgoings = [...(autoReplyOutgoingsByFriend.get(c.friend_id) ?? [])];

    let nonMatching: RawIncomingRow | undefined;
    for (const i of incomings) {
      if (consumeAutoReplyEvidence(i.created_at, remainingOutgoings)) continue;
      if (matchesAnyKeyword(i.content, i.message_type, activeRules)) continue;
      // この incoming は人間対応必要 → preview として採用 (最新の非マッチ)
      nonMatching = i;
      break;
    }
    if (!nonMatching) continue;

    rows.push({
      friendId: c.friend_id,
      displayName: c.display_name,
      pictureUrl: c.picture_url,
      accountId: c.line_account_id,
      accountName: c.account_name,
      lastIncomingAt: nonMatching.created_at,
      lastManualAt: c.last_manual,
      lastMachineAt: c.last_machine,
      lastIncomingType: nonMatching.message_type,
      lastIncomingContent: nonMatching.content,
    });
  }

  // 新しい順 (= 直近 incoming が先頭)。実運用では「最近来た会話を上から潰す」
  // 流れの方が手が動く (2026-05-12 野田さん運用フィードバック)。
  rows.sort((a, b) => b.lastIncomingAt.localeCompare(a.lastIncomingAt));
  return rows;
}

export async function computeUnansweredInbox(
  db: D1Database,
  opts: UnansweredInboxOptions = {},
): Promise<UnansweredInboxResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const allRows = await getAllUnansweredRows(db);
  const filtered = applyFilters(allRows, opts);
  const slice = filtered.slice(offset, offset + pageSize);

  return {
    total: filtered.length,
    page,
    pageSize,
    rows: slice,
  };
}

/**
 * 未対応 (人間が返事してない) friend ID の Set を返す。
 * /api/chats?unansweredOnly=true で chat list を絞るのに使う。
 * 判定ロジックは getAllUnansweredRows と同じ source of truth。
 */
export async function getUnansweredFriendIds(db: D1Database): Promise<Set<string>> {
  const rows = await getAllUnansweredRows(db);
  return new Set(rows.map((r) => r.friendId));
}

export async function countUnanswered(db: D1Database): Promise<UnansweredCount> {
  // 自動応答の1対1消費と最古待ち時間には全候補の判定が必要。
  // 件数に不要な last_machine の履歴検索だけを省く。キャッシュで鮮度を変えない。
  const allRows = await getAllUnansweredRows(db, false);

  const byAccountMap = new Map<string, { accountName: string; count: number }>();
  let oldest: string | null = null;
  for (const r of allRows) {
    const key = r.accountId ?? '__unassigned__';
    const existing = byAccountMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      byAccountMap.set(key, { accountName: r.accountName, count: 1 });
    }
    if (oldest === null || r.lastIncomingAt < oldest) oldest = r.lastIncomingAt;
  }

  const byAccount = [...byAccountMap.entries()]
    .map(([accountId, v]) => ({ accountId, accountName: v.accountName, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const oldestWaitMinutes =
    oldest !== null
      ? Math.max(0, Math.floor((Date.now() - new Date(oldest).getTime()) / 60_000))
      : null;

  return {
    total: allRows.length,
    byAccount,
    oldestWaitMinutes,
  };
}
