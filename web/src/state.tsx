import { createContext, useContext } from 'react';

export interface Me {
  id: number;
  email: string | null;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  lang: 'ru' | 'it';
  languages: string[];
  country: string | null;
  kind: 'adult' | 'child';
  role: 'user' | 'admin';
  parentId: number | null;
  locationPrecision: 'city' | 'country' | 'distance';
  whoCanWrite: 'friends' | 'friends_penpals' | 'everyone';
  readReceipts: boolean;
  penpalEnabled: boolean;
  bottleEnabled: boolean;
  dailyDigest: boolean;
  sounds: boolean;
  animations: boolean;
  notifyTripEvents: boolean;
  timezone: string;
  semi: number;
  slots: number;
  inviteCode: string;
  onboarded: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  stats: { lettersSent: number; lettersReceived: number; km: number };
  interests: string[];
  dailyBonus: number;
  unreadLetters: number;
  unreadNotifications: number;
  hasLocation: boolean;
  location: { lon: number; lat: number; updatedAt: string } | null;
  publicLocation: any;
  tariffs: string[];
  vapidPublicKey: string | null;
}

export interface Session {
  me: Me;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
  /** Растёт с каждым уведомлением по SSE — экраны перезагружают данные. */
  pulse: number;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('no session');
  return s;
}
