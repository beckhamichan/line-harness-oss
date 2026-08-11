/**
 * LIFF 教材ライブラリページ — be Navigator「コツコツ勉強会 教材ライブラリ」
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=library
 * Static read-only page. No profile lookup, tagging, or API calls.
 */

import { LIBRARY_LESSONS } from './lessons.js';

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderLibrary(): void {
  const lessonsHtml = LIBRARY_LESSONS.map(
    (lesson) => `
      <article class="library-card">
        <div class="library-card-head">
          <span class="library-number">${lesson.number}</span>
          <h2 class="library-title">${esc(lesson.title)}</h2>
        </div>
        <p class="library-desc">${esc(lesson.description)}</p>
        <div class="library-video">
          <iframe
            src="https://www.youtube.com/embed/${encodeURIComponent(lesson.videoId)}"
            title="${esc(lesson.title)}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
      </article>`,
  ).join('');

  getApp().innerHTML = `
    <div class="library-page">
      <div class="library-hero">
        <div class="library-hero-brand">be Navigator</div>
        <h1 class="library-hero-title">コツコツ勉強会 教材ライブラリ</h1>
        <p class="library-hero-sub">配信を見逃しても、ここからいつでも学び直せます🫀</p>
      </div>

      <div class="library-list">${lessonsHtml}</div>
    </div>`;
}

function injectStyles(): void {
  if (document.getElementById('library-styles')) return;
  const style = document.createElement('style');
  style.id = 'library-styles';
  style.textContent = `
    body { align-items: flex-start; background: #f5f7fa; }
    #app { padding: 0; }
    .library-page { max-width: 480px; margin: 0 auto; padding: 16px; color: #1e293b; }
    .library-hero { text-align: center; background: #eef4fb; border-radius: 16px; padding: 22px 16px; }
    .library-hero-brand { font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #0B2A4A; }
    .library-hero-title { font-size: 21px; font-weight: 800; color: #0B2A4A; margin: 6px 0 6px; line-height: 1.35; }
    .library-hero-sub { font-size: 13px; line-height: 1.7; color: #475569; }
    .library-list { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
    .library-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px; box-shadow: 0 2px 12px rgba(11,42,74,0.05); }
    .library-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .library-number { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; background: #0B2A4A; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; }
    .library-title { font-size: 17px; line-height: 1.35; font-weight: 800; color: #0B2A4A; margin: 0; }
    .library-desc { font-size: 13px; line-height: 1.7; color: #475569; margin: 0 0 12px; }
    .library-video { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 10px; background: #e2e8f0; }
    .library-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  `;
  document.head.appendChild(style);
}

export async function initLibrary(): Promise<void> {
  injectStyles();
  renderLibrary();
}
