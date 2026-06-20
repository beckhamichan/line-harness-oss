/**
 * LIFF 診断ページ — beナビ「心電図 学習タイプ診断（航海マップ）」
 *
 * Flow:
 * 1. liff.getProfile() で userId を取得
 * 2. 全6問に回答（各選択肢が F/P/V/L にポイント配分）
 * 3. クライアントで最高得点タイプを判定（同点は F→L→P→V 優先）
 * 4. POST /api/liff/diagnosis { lineUserId, type, scores } を送信
 *    → サーバーが metadata 保存・結果メッセージ Push・シナリオ enroll を担う
 * 5. 結果画面を表示（タイプ説明＋おすすめ）→「LINEに戻る」で closeWindow()
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=diagnosis
 * 質問・配点・タイプ定義は サイト素材/診断/Diagnosis.html から移植。
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  isInClient(): boolean;
  closeWindow(): void;
};

type TypeKey = 'F' | 'P' | 'V' | 'L';

interface DxChoice {
  t: string;
  w: Partial<Record<TypeKey, number>>;
}
interface DxQuestion {
  q: string;
  choices: DxChoice[];
}

// ── 質問データ（各選択肢が4タイプにポイントを配分）──
const DX_QUESTIONS: DxQuestion[] = [
  {
    q: ' 心電図を勉強していて、いちばん「うっ…」となる瞬間は？',
    choices: [
      { t: 'そもそも何を見ればいいか分からない', w: { F: 2 } },
      { t: '波形は読めるが、実戦スピードについていけない', w: { P: 2 } },
      { t: '毎回ゼロから考えてしまい、パッと判断できない', w: { V: 2 } },
      { t: 'なぜそうなるのか理屈が腑に落ちない', w: { L: 2 } },
    ],
  },
  {
    q: '新しい不整脈を覚えるとき、いちばんしっくりくるのは？',
    choices: [
      { t: '正常との違いを一つずつ整理する', w: { F: 2 } },
      { t: 'とにかく数をこなして体で覚える', w: { P: 2 } },
      { t: '典型的な波形の「見た目」を丸ごと記憶する', w: { V: 2 } },
      { t: '発生メカニズムから順序立てて理解する', w: { L: 2 } },
    ],
  },
  {
    q: '心電図検定を受けるとしたら、今の自分は？',
    choices: [
      { t: '基本用語からあやしい。土台づくりが必要', w: { F: 2 } },
      { t: '知識はある。あとは場数と速度', w: { P: 2 } },
      { t: '見慣れた波形なら強いが、変則パターンに弱い', w: { V: 2 } },
      { t: '丸暗記は嫌い。理解で勝負したい', w: { L: 2 } },
    ],
  },
  {
    q: '勉強できる時間とスタイルに近いのは？',
    choices: [
      { t: 'じっくり腰を据えて体系的に学びたい', w: { F: 1, L: 1 } },
      { t: 'スキマ時間にサクサク数をこなしたい', w: { P: 1, V: 1 } },
      { t: '通勤・休憩中にスマホでパッと反復したい', w: { V: 1, P: 1 } },
      { t: 'じっくり1問を深掘りして納得したい', w: { L: 1, F: 1 } },
    ],
  },
  {
    q: '間違えた問題に対して、あなたは？',
    choices: [
      { t: '基礎が抜けてないか教科書に戻る', w: { F: 2 } },
      { t: '似た問題をもう一度解いて潰す', w: { P: 2 } },
      { t: '正解の波形を目に焼き付けて次へ', w: { V: 2 } },
      { t: 'なぜ間違えたか理由を言語化する', w: { L: 2 } },
    ],
  },
  {
    q: '理想の「できるようになった自分」に近いのは？',
    choices: [
      { t: '基本波形を自信を持って説明できる', w: { F: 2 } },
      { t: '本番でも時間内に正確に判断できる', w: { P: 2 } },
      { t: 'ひと目で病態をパターン認識できる', w: { V: 2 } },
      { t: '後輩に理由まで含めて教えられる', w: { L: 2 } },
    ],
  },
];

// ── 結果タイプ（表示用）──
interface DxType {
  emoji: string;
  name: string;
  desc: string;
  methods: [string, string][];
  start: { name: string; why: string };
}
const DX_TYPES: Record<TypeKey, DxType> = {
  F: {
    emoji: '📚',
    name: 'コツコツ基礎固めタイプ',
    desc: '土台をていねいに積み上げると一番伸びる人。いきなり応用より、正常波形と基本所見を「説明できる」状態をつくるのが近道です。まずは無料で触れて、そのまま“コツコツ勉強会”で習慣化していきましょう。',
    methods: [
      ['🎮', '心電図クイズアプリ ── 解説つきの学習モードで、基礎を1問ずつ確認（無料）'],
      ['💬', '公式LINE ── 学習のきっかけや勉強会の案内が届く、続けるための入口（無料）'],
      ['🐢', 'コツコツ勉強会 ── 週5回・夜21:30からの90分Zoom。基礎から順に積める'],
      ['📺', 'アーカイブ動画 ── 見逃しても限定公開動画で何度でも復習できる'],
    ],
    start: { name: '🎮 まずはアプリ＋公式LINEから', why: '無料で今日から始められます。続けたくなったら会員でコツコツ勉強会へ。' },
  },
  P: {
    emoji: '🎯',
    name: '検定で結果を出すタイプ',
    desc: '知識はある、あとは「本番で点を取れるか」が勝負の人。アウトプット量がそのまま実力になります。beナビは検定対策が看板。1級・マイスター対策まで、仲間と一気に駆け上がれます。',
    methods: [
      ['🎮', 'クイズアプリ・検定モード ── タイマーありの本番形式で速度と精度を鍛える'],
      ['🏅', '検定チャレンジコース ── 1級チャレンジや判読トレーニングで実戦力を上げる'],
      ['⚡', 'スピード判読シリーズ ── 短時間で正確に読む“瞬発力”を磨く勉強会'],
      ['🌟', 'マイスター対策 ── 受験者0.1%のSランク合格者も在籍する環境で本気の頂点へ'],
    ],
    start: { name: '🎮 アプリの検定モードで腕試し', why: '今の実力を測ったら、検定チャレンジコースで一気に仕上げを。' },
  },
  V: {
    emoji: '🖼',
    name: 'パターンで覚えるタイプ',
    desc: '典型像を「見た目」で覚えるのが得意な人。良質な波形をたくさん浴びて、ひと目で病態を引き当てる回路を作るのが武器。アプリで量をこなし、勉強会で“紛らわしい違い”を詰めましょう。',
    methods: [
      ['🎮', 'クイズアプリ ── スキマ時間に高速反復、パターンを脳に焼き付ける（無料）'],
      ['📺', 'アーカイブ動画 ── 判読会シリーズで典型波形を一気にインプット'],
      ['🩺', 'PVC・AFシリーズ ── 部位診断や鑑別など、紛らわしいパターンを体系的に整理'],
      ['📘', 'ナースまつり教材 ── 小冊子・リーフレットで典型波形を見比べられる'],
    ],
    start: { name: '🎮 アプリで反復スタート', why: 'まずは数をこなして「見た瞬間に分かる」波形のストックを増やしましょう。' },
  },
  L: {
    emoji: '🧠',
    name: '語れるようになりたいタイプ',
    desc: '「なぜそうなるか」が腑に落ちて初めて力になる人。一人の暗記では限界があります。臨床推論型勉強会と仲間との対話で、“読める”を“語れる・使える”へ。まさにbeナビの真ん中の価値です。',
    methods: [
      ['👥', 'beナビ会員コミュニティ ── 仲間と読み・考え・語る、循環する学習環境'],
      ['🧑‍🏫', '臨床推論型勉強会 ── 「この心電図で臨床は何を考えるか」を週5回・90分で深掘り'],
      ['💭', 'Discord交流 ── 疑問をその場で相談し合え、心電図を語れる仲間ができる'],
      ['🎮', 'クイズアプリ・学習モード ── 解説で理屈を確認しながら土台を固める（無料）'],
    ],
    start: { name: '👥 会員で仲間と学ぶ', why: '仲間と続ける環境が、理解タイプの伸びを最大化します。' },
  },
};

// 同点時の優先順（基礎・理解を優先）
const TIE_ORDER: TypeKey[] = ['F', 'L', 'P', 'V'];
const CHOICE_KEYS = ['A', 'B', 'C', 'D'];

// ── 状態 ──
let dxIndex = 0;
let dxScores: Record<TypeKey, number> = { F: 0, P: 0, V: 0, L: 0 };
let dxProfile: { userId: string; displayName: string } | null = null;
let dxSubmitting = false;

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function computeType(): TypeKey {
  let best: TypeKey = TIE_ORDER[0];
  for (const k of TIE_ORDER) {
    if (dxScores[k] > dxScores[best]) best = k;
  }
  return best;
}

// ── 画面：イントロ ──
function renderIntro(): void {
  getApp().innerHTML = `
    <div class="dx-page">
      <div class="dx-card dx-intro">
        <div class="dx-badge">🫀 ECG STUDY DIAGNOSIS ・ 60秒</div>
        <h1 class="dx-title">航海マップ診断</h1>
        <p class="dx-lead">6つの質問で、あなたの“心電図 学習タイプ”が分かります。<br>タイプに合わせて、これからの航海をご案内します。</p>
        <button class="dx-btn" id="dxStartBtn">診断をはじめる</button>
        <p class="dx-note">※学習・教育目的の診断です。</p>
      </div>
    </div>`;
  document.getElementById('dxStartBtn')?.addEventListener('click', () => {
    dxIndex = 0;
    dxScores = { F: 0, P: 0, V: 0, L: 0 };
    renderQuestion();
  });
}

// ── 画面：質問 ──
function renderQuestion(): void {
  const total = DX_QUESTIONS.length;
  const q = DX_QUESTIONS[dxIndex];
  const pct = Math.round((dxIndex / total) * 100);
  const choicesHtml = q.choices
    .map(
      (c, i) =>
        `<button class="dx-choice" data-i="${i}"><span class="dx-k">${CHOICE_KEYS[i]}.</span> ${esc(c.t)}</button>`,
    )
    .join('');
  getApp().innerHTML = `
    <div class="dx-page">
      <div class="dx-progress">
        <div class="dx-progress-row"><span>Q${dxIndex + 1} / ${total}</span><span>${pct}%</span></div>
        <div class="dx-bar"><div class="dx-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="dx-card">
        <p class="dx-qnum">QUESTION ${dxIndex + 1}</p>
        <h2 class="dx-qtext">${esc(q.q)}</h2>
        <div class="dx-choices">${choicesHtml}</div>
      </div>
    </div>`;
  getApp()
    .querySelectorAll<HTMLButtonElement>('.dx-choice')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        const w = q.choices[i].w;
        (Object.keys(w) as TypeKey[]).forEach((k) => {
          dxScores[k] += w[k] ?? 0;
        });
        dxIndex++;
        if (dxIndex >= DX_QUESTIONS.length) finish();
        else renderQuestion();
      });
    });
  getApp().scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 判定 → サーバー送信 → 結果表示 ──
async function finish(): Promise<void> {
  const type = computeType();
  // 送信中表示
  getApp().innerHTML = `<div class="dx-page"><div class="dx-card dx-loading"><div class="dx-spinner"></div><p>航海マップを作成中…</p></div></div>`;

  // サーバーへ結果を送信（best-effort。失敗しても結果画面は表示する）
  if (!dxSubmitting && dxProfile?.userId) {
    dxSubmitting = true;
    try {
      await fetch('/api/liff/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: dxProfile.userId,
          type,
          scores: dxScores,
        }),
      });
    } catch {
      // ネットワーク失敗時も結果は見せる（再診断で再送可能）
    } finally {
      dxSubmitting = false;
    }
  }

  renderResult(type);
}

// ── 画面：結果 ──
function renderResult(type: TypeKey): void {
  const t = DX_TYPES[type];
  const methodsHtml = t.methods
    .map(
      ([emoji, text]) =>
        `<div class="dx-method"><span class="dx-method-emoji">${emoji}</span><span>${esc(text)}</span></div>`,
    )
    .join('');
  getApp().innerHTML = `
    <div class="dx-page">
      <div class="dx-card dx-result">
        <p class="dx-result-label">あなたの航海マップは…</p>
        <div class="dx-result-emoji">${t.emoji}</div>
        <h1 class="dx-result-name">${esc(t.name)}</h1>
        <p class="dx-result-desc">${esc(t.desc)}</p>
        <p class="dx-section">► あなたに合う beナビ の使い方</p>
        <div class="dx-methods">${methodsHtml}</div>
        <div class="dx-start"><strong>${esc(t.start.name)}</strong><br>${esc(t.start.why)}</div>
        <p class="dx-pushed">診断結果はLINEのトークにもお届けしました🗺️<br>このまま閉じてLINEに戻ってください。</p>
        <button class="dx-btn" id="dxCloseBtn">LINEに戻る</button>
        <button class="dx-btn dx-btn-ghost" id="dxAgainBtn">もう一度診断する</button>
      </div>
    </div>`;
  document.getElementById('dxCloseBtn')?.addEventListener('click', () => {
    if (liff.isInClient()) liff.closeWindow();
  });
  document.getElementById('dxAgainBtn')?.addEventListener('click', () => {
    dxSubmitting = false;
    renderIntro();
  });
  getApp().scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showDxError(message: string): void {
  getApp().innerHTML = `<div class="dx-page"><div class="dx-card dx-loading"><p>${esc(message)}</p></div></div>`;
}

function injectStyles(): void {
  if (document.getElementById('dx-styles')) return;
  const style = document.createElement('style');
  style.id = 'dx-styles';
  style.textContent = `
    .dx-page { max-width: 480px; margin: 0 auto; padding: 16px; color: #1e293b; }
    .dx-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 14px rgba(11,42,74,0.08); }
    .dx-intro { text-align: center; }
    .dx-badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #0B2A4A; background: #eef4fb; padding: 6px 12px; border-radius: 999px; margin-bottom: 16px; }
    .dx-title { font-size: 24px; font-weight: 800; color: #0B2A4A; margin-bottom: 12px; }
    .dx-lead { font-size: 14px; line-height: 1.8; color: #475569; margin-bottom: 24px; }
    .dx-note { font-size: 11px; color: #94a3b8; margin-top: 14px; }
    .dx-btn { display: block; width: 100%; padding: 15px; border: none; border-radius: 12px; font-size: 16px; font-weight: 800; color: #fff; background: #0B2A4A; cursor: pointer; transition: opacity .15s; font-family: inherit; }
    .dx-btn:active { opacity: .85; }
    .dx-btn-ghost { background: #fff; color: #64748b; border: 1.5px solid #e2e8f0; margin-top: 10px; font-weight: 700; font-size: 14px; }
    .dx-progress { margin-bottom: 14px; }
    .dx-progress-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
    .dx-bar { height: 6px; background: #e9eef5; border-radius: 999px; overflow: hidden; }
    .dx-bar-fill { height: 100%; background: #F5871F; transition: width .25s; }
    .dx-qnum { font-size: 11px; font-weight: 800; letter-spacing: .08em; color: #F5871F; margin-bottom: 8px; }
    .dx-qtext { font-size: 18px; font-weight: 800; line-height: 1.6; color: #0B2A4A; margin-bottom: 20px; }
    .dx-choices { display: flex; flex-direction: column; gap: 10px; }
    .dx-choice { text-align: left; padding: 14px 16px; border: 1.5px solid #e2e8f0; border-radius: 12px; background: #fafbfc; font-size: 15px; line-height: 1.5; color: #1e293b; cursor: pointer; transition: all .12s; font-family: inherit; }
    .dx-choice:active { background: #eef4fb; border-color: #0B2A4A; }
    .dx-k { font-weight: 800; color: #F5871F; margin-right: 4px; }
    .dx-loading { text-align: center; padding: 48px 24px; color: #475569; }
    .dx-spinner { width: 36px; height: 36px; margin: 0 auto 16px; border: 3px solid #e9eef5; border-top-color: #0B2A4A; border-radius: 50%; animation: dx-spin .8s linear infinite; }
    @keyframes dx-spin { to { transform: rotate(360deg); } }
    .dx-result { text-align: center; }
    .dx-result-label { font-size: 13px; color: #64748b; margin-bottom: 6px; }
    .dx-result-emoji { font-size: 56px; line-height: 1; margin: 8px 0; }
    .dx-result-name { font-size: 22px; font-weight: 800; color: #0B2A4A; margin-bottom: 14px; }
    .dx-result-desc { font-size: 14px; line-height: 1.85; color: #475569; text-align: left; margin-bottom: 22px; }
    .dx-section { font-size: 14px; font-weight: 800; color: #0B2A4A; text-align: left; margin-bottom: 12px; }
    .dx-methods { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .dx-method { display: flex; gap: 10px; align-items: flex-start; text-align: left; font-size: 13px; line-height: 1.6; color: #334155; background: #f8fafc; border-radius: 10px; padding: 12px; }
    .dx-method-emoji { flex-shrink: 0; font-size: 18px; }
    .dx-start { text-align: left; font-size: 13px; line-height: 1.7; color: #0B2A4A; background: #eef4fb; border-radius: 10px; padding: 14px; margin-bottom: 18px; }
    .dx-pushed { font-size: 12px; color: #64748b; line-height: 1.7; margin-bottom: 18px; }
  `;
  document.head.appendChild(style);
}

export async function initDiagnosis(): Promise<void> {
  injectStyles();
  try {
    dxProfile = await liff.getProfile();
  } catch {
    showDxError('LINEのプロフィール取得に失敗しました。LINEアプリ内で開き直してください。');
    return;
  }
  renderIntro();
}
