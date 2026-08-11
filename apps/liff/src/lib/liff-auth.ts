import liff from '@line/liff';
import { buildTrackedLinkRedirect } from './tracked-link-redirect.js';

let _liffId: string | null = null;
let _lineUserId: string | null = null;
let _idToken: string | null = null;

export async function initLiff(): Promise<boolean> {
  const url = new URL(window.location.href);
  const liffId = url.searchParams.get('liffId') ?? import.meta.env.VITE_DEFAULT_LIFF_ID;
  if (!liffId) {
    throw new Error('liffId not provided. Append ?liffId=... to the URL.');
  }
  _liffId = liffId;
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login();
    return false;
  }
  const profile = await liff.getProfile();
  _lineUserId = profile.userId;
  // id_token は Worker 側で LINE Login verify API を叩いて caller を確定するために使う。
  _idToken = liff.getIDToken();

  const redirect = url.searchParams.get('redirect');
  if (redirect) {
    window.location.replace(buildTrackedLinkRedirect(redirect, profile.userId, import.meta.env.VITE_API_BASE));
    return true;
  }

  return false;
}

export function getLiffId(): string {
  if (!_liffId) throw new Error('LIFF not initialized');
  return _liffId;
}

export function getLineUserId(): string {
  if (!_lineUserId) throw new Error('LIFF not initialized');
  return _lineUserId;
}

export function getIdToken(): string {
  if (!_idToken) throw new Error('LIFF not initialized or id_token not available');
  return _idToken;
}
