// 与 Tauri 壳的通信层：通用 HTTP + 媒体代理地址拼接
import { invoke } from '@tauri-apps/api/core';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const PROXY_HOST = 'stream.localhost';

export interface HttpOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutSecs?: number;
}

export interface HttpTextResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** 是否运行在 Tauri 壳内（浏览器 dev 模式下走降级路径） */
export function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function httpText(o: HttpOptions): Promise<string> {
  if (inTauri()) {
    const res = await invoke<HttpTextResponse>('http_request', { options: o });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.body;
  }
  const res = await fetch(o.url, { method: o.method ?? 'GET', headers: o.headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function httpBinary(o: HttpOptions): Promise<ArrayBuffer> {
  if (inTauri()) {
    return invoke<ArrayBuffer>('http_binary', { options: o });
  }
  const res = await fetch(o.url, { headers: o.headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

export async function httpJson<T>(o: HttpOptions): Promise<T> {
  return JSON.parse(await httpText(o)) as T;
}

// ---------------------------------------------------------------- 媒体代理

/** 已登记的请求头档案：headers JSON → profile id */
const profileCache = new Map<string, string>();

export async function proxyId(headers: Record<string, string> = {}): Promise<string> {
  const key = JSON.stringify(headers);
  const cached = profileCache.get(key);
  if (cached) return cached;
  const id = await invoke<string>('register_proxy_profile', { headers });
  profileCache.set(key, id);
  return id;
}

export function proxied(id: string, url: string): string {
  return `http://${PROXY_HOST}/${id}/${encodeURIComponent(url)}`;
}

/**
 * 把任意媒体/图片地址包成代理地址（补防盗链头 + 绕开 CORS）。
 * 浏览器 dev 模式下直接返回原地址。
 */
export async function proxiedUrl(url: string, referer?: string): Promise<string> {
  if (!inTauri()) return url;
  const headers: Record<string, string> = {};
  if (referer) headers['Referer'] = referer;
  const id = await proxyId(headers);
  return proxied(id, url);
}

/** 由地址推导 Referer（同源首页），采集站防盗链常用 */
export function refererOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return undefined;
  }
}
