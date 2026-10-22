// 本地持久化：源配置 / 设置 / 观看进度（全部只存本机，无账号无服务器）
import type { HistoryEntry, Settings, SourceConfig } from './types';
import { DEFAULT_SOURCES } from './defaults';

const CONFIG_KEY = 'libretv-native/v1/config';
const HISTORY_KEY = 'libretv-native/v1/history';

interface Config {
  sources: SourceConfig[];
  settings: Settings;
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Config>;
      return {
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        settings: { adultFilter: true, ...(parsed.settings ?? {}) },
      };
    }
  } catch {
    /* 忽略损坏的本地数据 */
  }
  return {
    sources: DEFAULT_SOURCES.map((s, i) => ({ ...s, key: `default_${i}`, enabled: true })),
    settings: { adultFilter: true },
  };
}

let config: Config = loadConfig();

function persist(): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function getSources(): SourceConfig[] {
  return config.sources;
}

export function getEnabledSources(): SourceConfig[] {
  return config.sources.filter((s) => s.enabled !== false);
}

export function addSource(input: Omit<SourceConfig, 'key'>): SourceConfig {
  const key = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const source: SourceConfig = { ...input, key, enabled: true };
  config.sources.push(source);
  persist();
  return source;
}

export function removeSource(key: string): void {
  config.sources = config.sources.filter((s) => s.key !== key);
  persist();
}

export function setSourceEnabled(key: string, enabled: boolean): void {
  const s = config.sources.find((x) => x.key === key);
  if (s) {
    s.enabled = enabled;
    persist();
  }
}

export function getSettings(): Settings {
  return config.settings;
}

export function updateSettings(patch: Partial<Settings>): void {
  config.settings = { ...config.settings, ...patch };
  persist();
}

/** 归一化用户粘贴的采集站地址 */
export function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  return url;
}

// ---------------------------------------------------------------- 观看进度

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* 忽略 */
  }
  return [];
}

let history: HistoryEntry[] = loadHistory();

function persistHistory(): void {
  // 只保留最近 200 条，避免无限增长
  history.sort((a, b) => b.updatedAt - a.updatedAt);
  history = history.slice(0, 200);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getHistory(): HistoryEntry[] {
  return history;
}

export function getProgress(sourceKey: string, vodId: string): HistoryEntry | undefined {
  return history.find((e) => e.sourceKey === sourceKey && e.vodId === vodId);
}

export function saveProgress(entry: HistoryEntry): void {
  const idx = history.findIndex(
    (e) => e.sourceKey === entry.sourceKey && e.vodId === entry.vodId,
  );
  if (idx >= 0) history[idx] = entry;
  else history.push(entry);
  persistHistory();
}
