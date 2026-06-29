/**
 * LIFF Hub ページ — be Navigator「ようこそ／目的を選ぶ入口」
 *
 * Flow:
 * 1. liff.getProfile() で userId を取得
 * 2. 会員かどうかを自己申告
 * 3. 「ようこそ」体験（船長の歓迎）＋ 7つの目的カードを表示（単一選択）
 * 4. 1つ選んで「この航海に出航する」→ POST /api/liff/route-select { lineUserId, displayName, pictureUrl, interest, isMember }
 *    → サーバーが 興味タグ(I:)＋ルートタグ(R:) を付与（R: の tag_added で対応ルートが自動開始）
 * 5. 応答 data.nextPage === 'diagnosis'（心電図）なら ?page=diagnosis へ遷移、
 *    それ以外は完了画面を表示して liff.closeWindow()
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=hub
 * 文面は docs/beNavigator_CRM_V1_1_implementation_plan.md §6 に準拠。
 */

declare const liff: {
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  isInClient(): boolean;
  closeWindow(): void;
};

type RouteKey = 'ecg' | 'circ' | 'device' | 'hf' | 'ai' | 'goods' | 'event';

interface HubCard {
  key: RouteKey;
  emoji: string;
  title: string;
  desc: string;
}

// 7つの目的カード（設計書 §6 の最終文面）
const HUB_CARDS: HubCard[] = [
  { key: 'ecg', emoji: '🫀', title: '心電図を学びたい', desc: '「読める」から「使える・語れる」へ' },
  { key: 'circ', emoji: '🩺', title: '循環器を学びたい', desc: '基礎から、体系的に' },
  { key: 'device', emoji: '⚡', title: '心臓デバイス／ペースメーカー', desc: 'デバイスを、もう一歩深く' },
  { key: 'hf', emoji: '💗', title: '心不全を学びたい', desc: '病態から治療まで、つなげて理解' },
  { key: 'ai', emoji: '🤖', title: 'AI活用に興味がある', desc: '看護×AIの、いまの最前線' },
  { key: 'goods', emoji: '✍️', title: '文房具・便利グッズがほしい', desc: '現場で本当に使える道具の情報' },
  { key: 'event', emoji: '🎉', title: 'イベント情報がほしい', desc: 'ナースまつり・セミナーの最新案内' },
];

let hubProfile: { userId: string; displayName: string; pictureUrl?: string } | null = null;
let hubSelected: RouteKey | null = null;
let hubIsMember: boolean | null = null;
let hubSubmitting = false;

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── 画面：会員自己申告 ──
function renderMembership(): void {
  getApp().innerHTML = `
    <div class="hub-page">
      <div class="hub-hero">
        <div class="hub-hero-brand">be Navigator</div>
        <h1 class="hub-hero-title">現在、be Navigatorの月額メンバーですか？</h1>
      </div>

      <div class="hub-cards hub-membership">
        <button class="hub-card" data-member="true">
          <span class="hub-card-body">
            <span class="hub-card-title">はい、参加しています</span>
          </span>
          <span class="hub-card-chev">›</span>
        </button>
        <button class="hub-card" data-member="false">
          <span class="hub-card-body">
            <span class="hub-card-title">まだ参加していません</span>
          </span>
          <span class="hub-card-chev">›</span>
        </button>
      </div>
    </div>`;

  getApp()
    .querySelectorAll<HTMLButtonElement>('.hub-card[data-member]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        hubIsMember = btn.dataset.member === 'true';
        renderHub();
      });
    });
}

// ── 画面：Hub（ようこそ＋カード）──
function renderHub(): void {
  const cardsHtml = HUB_CARDS.map(
    (c) => `
    <button class="hub-card" data-k="${c.key}">
      <span class="hub-card-emoji">${c.emoji}</span>
      <span class="hub-card-body">
        <span class="hub-card-title">${esc(c.title)}</span>
        <span class="hub-card-desc">${esc(c.desc)}</span>
      </span>
      <span class="hub-card-chev">›</span>
    </button>`,
  ).join('');

  getApp().innerHTML = `
    <div class="hub-page">
      <div class="hub-hero">
        <div class="hub-hero-brand">be Navigator</div>
        <h1 class="hub-hero-title">ようこそ、be Navigatorへ 🫀</h1>
        <p class="hub-hero-sub">あなたの“学びの航海”は、ここから始まります</p>
      </div>

      <div class="hub-captain">
        <div class="hub-captain-avatar">B</div>
        <p class="hub-captain-text">はじめまして、船長のベッカミです。be Navigatorは、心電図も循環器も、現場で使う道具も、一緒に学ぶ仲間も——ナースの「学びたい」を、まるごと乗せた船です。まずは、あなたが“今いちばん”知りたいことを、1つだけ教えてください。</p>
      </div>

      <div class="hub-ask">
        <p class="hub-ask-q">今、いちばん学びたい・知りたいことは？</p>
        <p class="hub-ask-note">1つ選んでください（あとから、ほかの興味も追加できます）</p>
      </div>

      <div class="hub-cards">${cardsHtml}</div>

      <p class="hub-reassure">「全員、最初は読めませんでした。」<br>どの航路を選んでも、ひとりにはしません。</p>

      <button class="hub-go" id="hubGoBtn" disabled>この航海に出航する 🚢</button>
      <p class="hub-go-note">あとから、ほかの興味も追加できます</p>
    </div>`;

  getApp()
    .querySelectorAll<HTMLButtonElement>('.hub-card')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        hubSelected = btn.dataset.k as RouteKey;
        getApp()
          .querySelectorAll('.hub-card')
          .forEach((b) => b.classList.toggle('selected', b === btn));
        const go = document.getElementById('hubGoBtn') as HTMLButtonElement | null;
        if (go) go.disabled = false;
      });
    });

  document.getElementById('hubGoBtn')?.addEventListener('click', () => {
    void submitRoute();
  });
}

// ── 選択送信 → 遷移 or 完了画面 ──
async function submitRoute(): Promise<void> {
  if (hubSubmitting || !hubSelected || !hubProfile?.userId) return;
  hubSubmitting = true;
  const selected = hubSelected;

  getApp().innerHTML = `<div class="hub-page"><div class="hub-loading"><div class="hub-spinner"></div><p>航路を準備しています…</p></div></div>`;

  try {
    const res = await fetch('/api/liff/route-select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineUserId: hubProfile.userId,
        displayName: hubProfile.displayName,
        pictureUrl: hubProfile.pictureUrl ?? null,
        interest: selected,
        isMember: hubIsMember,
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: { interest: string; label?: string; nextPage?: string | null } }
      | null;

    const nextPage = json?.data?.nextPage ?? null;
    const label = json?.data?.label ?? HUB_CARDS.find((c) => c.key === selected)?.title ?? '';

    if (!res.ok || json?.success !== true) {
      renderDone(label, true, hubIsMember === true);
      return;
    }

    if (nextPage === 'diagnosis') {
      // 心電図ルート：そのまま診断へ（既存フロー）。liffId 等のクエリは保持。
      const params = new URLSearchParams(window.location.search);
      params.set('page', 'diagnosis');
      window.location.search = params.toString();
      return;
    }

    renderDone(label, false, hubIsMember === true);
  } catch {
    // 送信失敗時もユーザーを行き止まりにしない
    renderDone(HUB_CARDS.find((c) => c.key === selected)?.title ?? '', true, hubIsMember === true);
  } finally {
    hubSubmitting = false;
  }
}

// ── 画面：完了（心電図以外）──
function renderDone(label: string, failed = false, isMember = false): void {
  const msg = failed
    ? '受け付けに失敗したかもしれません。お手数ですが、もう一度お試しください。'
    : isMember
      ? `ご登録ありがとうございます。<br>「${esc(label)}」の興味を承りました。<br>このまま画面を閉じてください。`
      : `「${esc(label)}」の航海へ、ようこそ！🚢<br>ご案内はLINEのトークにお送りします。<br>このまま画面を閉じてお待ちください。`;
  getApp().innerHTML = `
    <div class="hub-page">
      <div class="hub-card-done">
        <div class="hub-done-emoji">🚢</div>
        <p class="hub-done-msg">${msg}</p>
        <button class="hub-go" id="hubCloseBtn">LINEに戻る</button>
      </div>
    </div>`;
  document.getElementById('hubCloseBtn')?.addEventListener('click', () => {
    if (liff.isInClient()) liff.closeWindow();
  });
}

function showHubError(message: string): void {
  getApp().innerHTML = `<div class="hub-page"><div class="hub-loading"><p>${esc(message)}</p></div></div>`;
}

function injectStyles(): void {
  if (document.getElementById('hub-styles')) return;
  const style = document.createElement('style');
  style.id = 'hub-styles';
  style.textContent = `
    .hub-page { max-width: 480px; margin: 0 auto; padding: 16px; color: #1e293b; }
    .hub-hero { text-align: center; background: #eef4fb; border-radius: 16px; padding: 22px 16px; }
    .hub-hero-brand { font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #0B2A4A; }
    .hub-hero-title { font-size: 21px; font-weight: 800; color: #0B2A4A; margin: 6px 0 4px; }
    .hub-hero-sub { font-size: 13px; color: #475569; }
    .hub-captain { display: flex; gap: 10px; align-items: flex-start; margin: 16px 0; }
    .hub-captain-avatar { flex-shrink: 0; width: 38px; height: 38px; border-radius: 50%; background: #0B2A4A; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; }
    .hub-captain-text { font-size: 13px; line-height: 1.7; color: #475569; }
    .hub-ask { margin: 6px 0 12px; }
    .hub-ask-q { font-size: 16px; font-weight: 800; color: #0B2A4A; }
    .hub-ask-note { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .hub-cards { display: flex; flex-direction: column; gap: 10px; }
    .hub-membership { margin-top: 16px; }
    .hub-card { display: flex; align-items: center; gap: 12px; text-align: left; width: 100%; padding: 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; background: #fafbfc; cursor: pointer; transition: all .12s; font-family: inherit; }
    .hub-card.selected { border-color: #0B2A4A; background: #eef4fb; border-width: 2px; }
    .hub-card-emoji { flex-shrink: 0; font-size: 22px; }
    .hub-card-body { flex: 1; display: flex; flex-direction: column; }
    .hub-card-title { font-size: 15px; font-weight: 700; color: #1e293b; }
    .hub-card-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .hub-card-chev { color: #cbd5e1; font-size: 22px; }
    .hub-reassure { text-align: center; font-size: 12px; line-height: 1.7; color: #94a3b8; margin: 18px 0; }
    .hub-go { display: block; width: 100%; padding: 15px; border: none; border-radius: 12px; font-size: 16px; font-weight: 800; color: #fff; background: #0B2A4A; cursor: pointer; transition: opacity .15s; font-family: inherit; }
    .hub-go:disabled { opacity: .4; cursor: default; }
    .hub-go:not(:disabled):active { opacity: .85; }
    .hub-go-note { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 8px; }
    .hub-loading { text-align: center; padding: 48px 24px; color: #475569; }
    .hub-spinner { width: 36px; height: 36px; margin: 0 auto 16px; border: 3px solid #e9eef5; border-top-color: #0B2A4A; border-radius: 50%; animation: hub-spin .8s linear infinite; }
    @keyframes hub-spin { to { transform: rotate(360deg); } }
    .hub-card-done { text-align: center; background: #fff; border-radius: 16px; padding: 32px 24px; box-shadow: 0 2px 14px rgba(11,42,74,0.08); }
    .hub-done-emoji { font-size: 48px; margin-bottom: 12px; }
    .hub-done-msg { font-size: 14px; line-height: 1.8; color: #334155; margin-bottom: 22px; }
  `;
  document.head.appendChild(style);
}

export async function initHub(): Promise<void> {
  injectStyles();
  try {
    hubProfile = await liff.getProfile();
  } catch {
    showHubError('LINEのプロフィール取得に失敗しました。LINEアプリ内で開き直してください。');
    return;
  }
  renderMembership();
}
