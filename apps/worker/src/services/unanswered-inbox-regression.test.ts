import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const DatabaseSync = (() => {
  try { return require('node:sqlite').DatabaseSync; }
  catch { return createRequire(new URL('../../../../packages/db/package.json', import.meta.url))('better-sqlite3'); }
})();
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, test, vi } from 'vitest';
import * as current from './unanswered-inbox.js';
import * as before from './__fixtures__/unanswered-inbox-before-0256.js';

// Synthetic data only. Prefer built-in SQLite; older Node uses the existing DB test dependency.
const databases: InstanceType<typeof DatabaseSync>[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); vi.useRealTimers(); });
function fixture(seed = 1, friends = 90, history = 12) {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE friends(id TEXT PRIMARY KEY, display_name TEXT, picture_url TEXT, line_account_id TEXT, is_following INTEGER);
    CREATE TABLE line_accounts(id TEXT PRIMARY KEY, name TEXT, is_active INTEGER);
    CREATE TABLE auto_replies(keyword TEXT, match_type TEXT, is_active INTEGER);
    CREATE TABLE messages_log(id TEXT PRIMARY KEY, friend_id TEXT, direction TEXT, source TEXT, delivery_type TEXT, message_type TEXT, content TEXT, created_at TEXT NOT NULL);
    INSERT INTO line_accounts VALUES ('a1','Account 1',1), ('a2','Account 2',1), ('inactive','Inactive',0);
    INSERT INTO auto_replies VALUES ('button','exact',1), ('FAQ','contains',1), ('question','exact',0);
  `);
  // Actual existing indexes, extracted from the tracked schema.
  const schema = readFileSync(new URL('../../../../packages/db/schema.sql', import.meta.url), 'utf8');
  sqlite.exec(schema.split('\n').filter((s) => s.startsWith('CREATE INDEX') && /ON messages_log /.test(s)).join('\n'));
  const friend = sqlite.prepare('INSERT INTO friends VALUES (?,?,?,?,?)');
  const message = sqlite.prepare('INSERT INTO messages_log VALUES (?,?,?,?,?,?,?,?)');
  let serial = 0;
  function add(id: string, at: string, direction = 'incoming', source: string | null = null, delivery = 'reply', type = 'text', content = 'question') {
    message.run(`m${serial++}`, id, direction, source, delivery, type, content, at);
  }
  let state = seed;
  const random = (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
  for (let i = 0; i < friends; i++) {
    const id = `synthetic-${String(i).padStart(4, '0')}`;
    friend.run(id, i % 7 ? `Person ${i}` : null, null, ['a1','a2','inactive',null,'missing'][i % 5], i % 9 ? 1 : 0);
    for (let j = 0; j < history; j++) {
      const at = new Date(Date.UTC(2020 + random(7), 0, 1, 0, 0, random(20))).toISOString();
      const direction = random(3) === 0 ? 'outgoing' : 'incoming';
      const source = direction === 'incoming' ? [null,'postback','webhook'][random(3)] : ['manual','auto_reply','broadcast','scenario','automation','automation_backfill','unknown'][random(7)];
      add(id, at, direction, source, ['reply','push','test'][random(3)], ['text','image','sticker'][random(3)], ['question','button','some FAQ here'][random(3)]);
    }
  }
  // No cutoff: a years-old unanswered message must survive.
  friend.run('ancient', 'Ancient', null, 'a1', 1);
  add('ancient','2001-01-01T00:00:00');
  // Same timestamp / evidence one-to-one / keyword / strict manual boundary.
  for (const id of ['tie','evidence','manual-boundary','postback-only','push-only','window-edge']) friend.run(id,id,null,'a2',1);
  add('tie','2026-01-01T00:00:00', 'incoming', null, 'reply', 'text', 'first');
  add('tie','2026-01-01T00:00:00', 'incoming', null, 'reply', 'text', 'second');
  add('evidence','2026-01-01T00:00:00'); add('evidence','2026-01-01T00:00:02');
  add('evidence','2026-01-01T00:00:03','outgoing','auto_reply');
  add('manual-boundary','2026-01-01T00:00:00','outgoing','manual'); add('manual-boundary','2026-01-01T00:00:00');
  add('postback-only','2026-01-01T00:00:00','incoming','postback');
  add('push-only','2026-01-01T00:00:00'); add('push-only','2026-01-01T00:00:01','outgoing','auto_reply','push');
  add('window-edge','2026-01-01T00:00:00'); add('window-edge','2026-01-01T00:00:05','outgoing','auto_reply');
  return sqlite;
}
function asD1(sqlite: InstanceType<typeof DatabaseSync>, beforeRead?: (sql: string) => void) {
  const queries: { sql: string; bindings: unknown[]; rows: number; plan: string[] }[] = [];
  const db = { prepare(sql: string) {
    let bindings: (string | number | null)[] = [];
    return {
      bind(...args: (string | number | null)[]) { bindings = args; return this; },
      async all() {
        beforeRead?.(sql);
        expect(bindings.length).toBeLessThanOrEqual(100);
        const results = sqlite.prepare(sql).all(...bindings);
        const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...bindings).map((r) => String(r.detail));
        queries.push({ sql, bindings, rows: results.length, plan });
        return { results };
      },
    };
  }} as unknown as D1Database;
  return { db, queries };
}

describe('ISSUE-0256 real SQLite equivalence against frozen 7abb3cad', () => {
  for (const seed of [1, 7, 42, 123, 999]) {
    test(`list, filters, pagination, IDs and counts unchanged (seed ${seed})`, async () => {
      vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
      const sqlite = fixture(seed);
      const old = asD1(sqlite); const now = asD1(sqlite);
      for (const opts of [{pageSize:2000}, {account:'a1'}, {q:'question'}, {q:'person'}, {minWaitMinutes:60}, {page:2,pageSize:3}]) {
        const got = await current.computeUnansweredInbox(now.db, opts);
        const expected = await before.computeUnansweredInbox(old.db, opts);
        const differences = got.rows.filter((row) => JSON.stringify(row) !== JSON.stringify(expected.rows.find((r) => r.friendId === row.friendId)));
        expect(differences).toEqual([]);
        expect(got.rows.map((r)=>r.friendId)).toEqual(expected.rows.map((r)=>r.friendId));
        expect(got.total).toBe(expected.total);
      }
      expect(await current.countUnanswered(now.db)).toEqual(await before.countUnanswered(old.db));
      expect(await current.getUnansweredFriendIds(now.db)).toEqual(await before.getUnansweredFriendIds(old.db));
      expect((await current.getUnansweredFriendIds(now.db)).has('ancient')).toBe(true);
    });
  }
  test('more than 100 candidates: one JSON bind, no extra history queries or duplicates', async () => {
    const sqlite = fixture(1, 0);
    for (let i=0;i<121;i++) {
      sqlite.prepare('INSERT INTO friends VALUES (?, ?, NULL, ?, 1)').run(`batch-${i}`,`Batch ${i}`,'a1');
      sqlite.prepare("INSERT INTO messages_log VALUES (?,?,'outgoing','manual','push','text','done',?)").run(`manual-${i}`,`batch-${i}`,'2025-01-01');
      sqlite.prepare("INSERT INTO messages_log VALUES (?,?,'incoming',NULL,'reply','text','question',?)").run(`in-${i}`,`batch-${i}`,'2026-01-01');
    }
    const old = asD1(sqlite); const now = asD1(sqlite);
    expect(await current.computeUnansweredInbox(now.db,{pageSize:2000})).toEqual(await before.computeUnansweredInbox(old.db,{pageSize:2000}));
    expect(Math.max(...now.queries.map((q)=>q.bindings.length))).toBe(1);
    expect(now.queries.filter((q)=>q.bindings.length)).toHaveLength(2);
  });
  test('manual reply between candidate and history reads is rechecked like the old SQL', async () => {
    const results = [];
    for (const implementation of [before, current]) {
      const sqlite = fixture(1, 0);
      let inserted = false;
      const adapter = asD1(sqlite, (sql) => {
        if (inserted || !sql.includes('WITH last_manual')) return;
        inserted = true;
        sqlite.prepare("INSERT INTO messages_log VALUES ('late-manual','ancient','outgoing','manual','push','text','done','2026-11-06')").run();
      });
      results.push(await implementation.computeUnansweredInbox(adapter.db));
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[1].rows.some((r)=>r.friendId==='ancient')).toBe(false);
  });
  test('empty DB and no candidates avoid history reads', async () => {
    const sqlite = fixture(1,0); sqlite.exec('UPDATE friends SET is_following=0');
    const now = asD1(sqlite);
    expect(await current.countUnanswered(now.db)).toEqual(await before.countUnanswered(asD1(sqlite).db));
    expect(now.queries).toHaveLength(1);
  });
  test('history uses indexed friend/time searches; count skips machine metadata', async () => {
    const sqlite = fixture(42, 300, 30); const old = asD1(sqlite); const now = asD1(sqlite);
    expect(await current.countUnanswered(now.db)).toEqual(await before.countUnanswered(old.db));
    const history = now.queries.filter((q)=>q.bindings.length);
    expect(history.length).toBeGreaterThan(0);
    for (const q of history) {
      expect(q.plan.some((p)=>p.includes('SCAN ml'))).toBe(false);
      expect(q.plan.some((p)=>p.includes('SEARCH ml') && p.includes('friend_id=?'))).toBe(true);
    }
    expect(history.some((q)=>q.plan.some((p)=>p.includes('created_at>?')))).toBe(true);
    expect(now.queries[0].sql).toContain('NULL AS last_machine');
    const oldHistory = old.queries.filter((q)=>q.sql.includes('WITH last_manual'));
    console.log('synthetic history result rows (NOT D1 rows_read)', {before:oldHistory.reduce((n,q)=>n+q.rows,0),after:history.reduce((n,q)=>n+q.rows,0)});
  });
  test('broadcast-heavy synthetic workload: record local VM work without claiming D1 rows_read', async () => {
    const sqlite = fixture(1, 0);
    const friend = sqlite.prepare('INSERT INTO friends VALUES (?, ?, NULL, ?, 1)');
    const message = sqlite.prepare('INSERT INTO messages_log VALUES (?,?,?,?,?,?,?,?)');
    for (let i=0; i<100; i++) {
      const id=`bulk-${i}`;
      friend.run(id,id,'a1');
      message.run(`bulk-in-${i}`,id,'incoming',null,'reply','text','question','2025-01-01');
      message.run(`bulk-manual-${i}`,id,'outgoing','manual','push','text','done','2025-01-02');
      for (let j=0;j<48;j++) message.run(`bulk-out-${i}-${j}`,id,'outgoing','broadcast','push','text','notice','2026-01-01');
    }
    const old = asD1(sqlite); const now = asD1(sqlite);
    expect(await current.countUnanswered(now.db)).toEqual(await before.countUnanswered(old.db));
    const tables = ['friends','line_accounts','auto_replies','messages_log'].map((name)=>({name,rows:sqlite.prepare(`SELECT * FROM ${name}`).all().map(Object.values)}));
    const schema = sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type='index'").all().map((r)=>r.sql);
    const input = {schema,tables,before:old.queries,after:now.queries};
    const result = JSON.parse(execFileSync('python3', ['-c', `
import json,sqlite3,sys
x=json.load(sys.stdin); d=sqlite3.connect(':memory:')
for sql in x['schema']: d.execute(sql)
for t in x['tables']:
    if t['rows']: d.executemany('INSERT INTO '+t['name']+' VALUES ('+','.join('?'*len(t['rows'][0]))+')',t['rows'])
result={}
for label in ['before','after']:
    steps=[0]
    def tick(): steps[0]+=1; return 0
    d.set_progress_handler(tick,1)
    for q in x[label]: d.execute(q['sql'],q['bindings']).fetchall()
    d.set_progress_handler(None,0); result[label]=steps[0]
print(json.dumps(result))
`], {input:JSON.stringify(input),encoding:'utf8'}));
    console.log('synthetic 5013-message workload: SQLite VM instructions (NOT D1 rows_read)', result);
    expect(result.after).toBeLessThan(result.before / 2);
    console.log('candidate/history query plans', [...new Set(now.queries.flatMap((q)=>q.plan))]);
  });

});
