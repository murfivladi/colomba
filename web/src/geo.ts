import type { LonLat } from '@colomba/shared';
import { api } from './api';

/** Живой GPS: в момент отправки и при открытии приложения. */
export function currentPosition(timeoutMs = 12000): Promise<{ point: LonLat; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ point: [p.coords.longitude, p.coords.latitude], accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}

export async function refreshLocation(): Promise<LonLat | null> {
  const pos = await currentPosition();
  if (!pos) return null;
  await api('/me/location', { body: { point: pos.point, accuracy: pos.accuracy } }).catch(() => {});
  return pos.point;
}

export async function geoPermission(): Promise<PermissionState | 'unsupported'> {
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return p.state;
  } catch {
    return 'unsupported';
  }
}
