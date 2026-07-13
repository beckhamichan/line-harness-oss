const NOTIFY_SKIP_EXACT = ['この夏', 'この夏！', 'この夏!', 'この夏🌊'];

export function shouldNotify(text: string): boolean {
  return !NOTIFY_SKIP_EXACT.includes(text);
}

export async function notifyDiscordInbound(
  webhookUrl: string,
  params: { displayName: string; text: string },
): Promise<void> {
  const characters = Array.from(params.text);
  const truncatedText = characters.length > 200
    ? `${characters.slice(0, 199).join('')}…`
    : params.text;
  const content = `📩 新着メッセージ\n👤 ${params.displayName}\n💬 ${truncatedText}`;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error('[discord-notify] Failed to notify inbound message', err);
  }
}
