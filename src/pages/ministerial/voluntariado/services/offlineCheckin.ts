















import { voluntariado } from '@/api';
import { ehFalhaDeRedeOuServidor, ehDuplicado } from '@/lib/falhaDeRede';
import type { VolSchedule } from '../types';



export type CheckinMethod = 'qr_code' | 'manual' | 'facial' | 'self_service';

export interface CheckinPayload {
  schedule_id?: string | null;
  volunteer_id?: string | null;
  service_id: string;
  method: CheckinMethod;
  is_unscheduled?: boolean;


  novo_cadastro?: boolean;
}

export interface CheckinDisplay {
  name: string;
  team?: string | null;
  position?: string | null;
  unscheduled?: boolean;
}

export interface PendingCheckin extends CheckinPayload {
  client_id: string;
  checked_in_at: string;
  display: CheckinDisplay;
}

export interface QrResolution {
  payload: CheckinPayload;
  display: CheckinDisplay;
}

const KEYS = {
  SERVICES: 'vol_totem_services',
  PROFILES: 'vol_totem_profiles',
  SCHED: (serviceId: string) => `vol_totem_sched_${serviceId}`,
  QUEUE: 'vol_totem_checkin_queue',
};



function readJSON<T>(key: string, fallback: T): T {
  try {
    const d = localStorage.getItem(key);
    return d ? (JSON.parse(d) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {

  }
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}



export function saveTodayServices(services: any[]): void {
  writeJSON(KEYS.SERVICES, services || []);
}
export function getTodayServices(): any[] {
  return readJSON<any[]>(KEYS.SERVICES, []);
}

export function saveProfiles(profiles: any[]): void {
  writeJSON(KEYS.PROFILES, profiles || []);
}
export function getProfiles(): any[] {
  return readJSON<any[]>(KEYS.PROFILES, []);
}

export function saveServiceSchedules(serviceId: string, schedules: VolSchedule[]): void {
  if (!serviceId) return;
  writeJSON(KEYS.SCHED(serviceId), schedules || []);
}
export function getServiceSchedules(serviceId: string): VolSchedule[] {
  if (!serviceId) return [];
  return readJSON<VolSchedule[]>(KEYS.SCHED(serviceId), []);
}



export function getQueue(): PendingCheckin[] {
  return readJSON<PendingCheckin[]>(KEYS.QUEUE, []);
}

export function getQueueCount(): number {
  return getQueue().length;
}

export function enqueueCheckin(payload: CheckinPayload, display: CheckinDisplay): PendingCheckin {
  const item: PendingCheckin = {
    ...payload,
    client_id: uuid(),
    checked_in_at: new Date().toISOString(),
    display,
  };
  const queue = getQueue();
  queue.push(item);
  writeJSON(KEYS.QUEUE, queue);
  return item;
}

function removeFromQueue(clientId: string): void {
  const queue = getQueue().filter((i) => i.client_id !== clientId);
  writeJSON(KEYS.QUEUE, queue);
}



export function checkinKey(p: { schedule_id?: string | null; volunteer_id?: string | null; service_id?: string | null }): string | null {
  if (p.schedule_id) return `sch:${p.schedule_id}`;
  if (p.volunteer_id && p.service_id) return `uns:${p.volunteer_id}:${p.service_id}`;
  return null;
}



export function buildLocalDoneSet(serviceId: string): Set<string> {
  const set = new Set<string>();

  for (const s of getServiceSchedules(serviceId)) {
    if ((s as any).check_in && s.id) set.add(`sch:${s.id}`);
  }

  for (const q of getQueue()) {
    const k = checkinKey(q);
    if (k) set.add(k);
  }
  return set;
}



export function resolveQrOffline(qrCode: string, serviceId: string): QrResolution | null {
  if (!qrCode || !serviceId) return null;
  const profiles = getProfiles();
  const profile = profiles.find((p) => p && p.qr_code && p.qr_code === qrCode);
  if (!profile) return null;

  const schedules = getServiceSchedules(serviceId);
  const sched = schedules.find(
    (s) => s.volunteer_id && s.volunteer_id === profile.id && !(s as any).check_in
  );

  if (sched) {
    return {
      payload: {
        schedule_id: sched.id,
        volunteer_id: profile.id,
        service_id: serviceId,
        method: 'qr_code',
      },
      display: { name: sched.volunteer_name || profile.full_name || 'Voluntário', team: sched.team_name, position: sched.position_name },
    };
  }
  return {
    payload: { volunteer_id: profile.id, service_id: serviceId, method: 'qr_code', is_unscheduled: true },
    display: { name: profile.full_name || 'Voluntário', unscheduled: true },
  };
}











export function isNetworkError(err: any): boolean {
  return ehFalhaDeRedeOuServidor(err);
}


export function isDuplicateError(err: any): boolean {
  return ehDuplicado(err);
}



let flushing = false;

export interface SyncResult {
  attempted: number;
  synced: number;
  remaining: number;
}




export async function syncQueue(): Promise<SyncResult> {
  if (flushing) return { attempted: 0, synced: 0, remaining: getQueueCount() };
  flushing = true;
  let synced = 0;
  let attempted = 0;
  try {
    const queue = getQueue();
    for (const item of queue) {
      attempted++;
      try {
        await voluntariado.checkIns.create({
          schedule_id: item.schedule_id || undefined,
          volunteer_id: item.volunteer_id || undefined,
          service_id: item.service_id,
          method: item.method,
          is_unscheduled: item.is_unscheduled,
          checked_in_at: item.checked_in_at,
        } as any);
        removeFromQueue(item.client_id);
        synced++;
      } catch (err: any) {
        if (isDuplicateError(err)) {

          removeFromQueue(item.client_id);
          synced++;
          continue;
        }
        if (isNetworkError(err)) {

          break;
        }


        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { attempted, synced, remaining: getQueueCount() };
}
