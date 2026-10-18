import type { Prisma } from '@prisma/client';
import {
  PUBLIC_SETTINGS_KEYS,
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  settingsSchemas,
  type BusinessSettings,
  type SettingsKey,
} from '@porcelanas/shared';
import { prisma } from '../db';
import { config } from '../config';
import { parse } from '../lib/errors';

let cache: { at: number; value: BusinessSettings } | null = null;
const TTL_MS = 5_000;

function merge<K extends SettingsKey>(key: K, stored: unknown): BusinessSettings[K] {
  const base = SETTINGS_DEFAULTS[key];
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const candidate = { ...base, ...(stored as object) };
    const r = settingsSchemas[key].safeParse(candidate);
    if (r.success) return r.data as BusinessSettings[K];
  }
  return base;
}

export async function getSettings(): Promise<BusinessSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await prisma.businessSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const value = {} as BusinessSettings;
  for (const key of SETTINGS_KEYS) {
    (value as Record<string, unknown>)[key] = merge(key, byKey.get(key));
  }
  if (!byKey.has('store')) value.store.timezone = config.BUSINESS_TIMEZONE;
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateSettings() {
  cache = null;
}

export async function updateSetting<K extends SettingsKey>(key: K, input: unknown, userId: string) {
  const value = parse(settingsSchemas[key], input) as BusinessSettings[K];
  await prisma.businessSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: userId },
    update: { value: value as Prisma.InputJsonValue, updatedById: userId },
  });
  invalidateSettings();
  return value;
}

export async function getPublicSettings() {
  const s = await getSettings();
  const out: Partial<BusinessSettings> = {};
  for (const key of PUBLIC_SETTINGS_KEYS) (out as Record<string, unknown>)[key] = s[key];
  return out;
}
