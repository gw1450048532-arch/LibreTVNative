// 苹果 CMS（Apple CMS）采集站客户端与响应解析
// 解析逻辑移植自 LibreTV（AGPL-3.0），与本项目许可一致
import type { SearchResultItem, SourceConfig, VideoDetail } from './types';
import { UA, httpJson, httpText } from './api';

export function cmsHeaders(): Record<string, string> {
  return { 'User-Agent': UA, Accept: 'application/json' };
}

function apiUrl(source: SourceConfig, params: Record<string, string>): string {
  const sep = source.url.includes('?') ? '&' : '?';
  const qs = new URLSearchParams({ ac: 'videolist', ...params }).toString();
  return `${source.url}${sep}${qs}`;
}

// ---------------------------------------------------------------- 解析

export function parseSearchList(data: unknown, source: SourceConfig): SearchResultItem[] {
  if (!data || typeof data !== 'object') throw new Error('API返回的数据格式无效');
  const list = (data as { list?: unknown }).list;
  if (list !== null && list !== undefined && !Array.isArray(list)) {
    throw new Error('API返回的数据格式无效');
  }
  return (Array.isArray(list) ? list : []).map((item) => {
    const vod = item as Record<string, unknown>;
    return {
      sourceKey: source.key,
      sourceName: source.name,
      vodId: String(vod.vod_id ?? ''),
      name: String(vod.vod_name ?? ''),
      pic: typeof vod.vod_pic === 'string' ? vod.vod_pic : undefined,
      typeName: typeof vod.type_name === 'string' ? vod.type_name : undefined,
      year: typeof vod.vod_year === 'string' ? vod.vod_year : undefined,
      area: typeof vod.vod_area === 'string' ? vod.vod_area : undefined,
      remarks: typeof vod.vod_remarks === 'string' ? vod.vod_remarks : undefined,
    };
  });
}

/** vod_play_url → 分集地址数组。优先取含 m3u8 直链的线路 */
export function extractEpisodesFromPlayUrl(playUrl: string): string[] {
  if (!playUrl) return [];
  const groups = playUrl
    .split('$$$')
    .map((group) =>
      group
        .split('#')
        .map((ep) => {
          const parts = ep.split('$');
          return parts.length > 1 ? parts[1] : '';
        })
        .filter((url) => url.startsWith('http://') || url.startsWith('https://'))
    )
    .filter((eps) => eps.length > 0);
  if (groups.length === 0) return [];
  return groups.find((eps) => eps.some((url) => url.includes('.m3u8'))) ?? groups[0];
}

export function parseDetail(data: unknown, source: SourceConfig): VideoDetail {
  const d = data as { list?: Record<string, unknown>[] };
  if (!d || !Array.isArray(d.list) || d.list.length === 0) {
    throw new Error('获取到的详情内容无效');
  }
  const vod = d.list[0];
  let episodes = extractEpisodesFromPlayUrl(String(vod.vod_play_url ?? ''));
  if (episodes.length === 0) {
    episodes = extractM3u8FromText(String(vod.vod_content ?? ''));
  }
  return {
    episodes,
    videoInfo: {
      title: str(vod.vod_name),
      cover: str(vod.vod_pic),
      desc: str(vod.vod_content),
      typeName: str(vod.type_name),
      year: str(vod.vod_year),
      area: str(vod.vod_area),
      director: str(vod.vod_director),
      actor: str(vod.vod_actor),
      remarks: str(vod.vod_remarks),
      sourceKey: source.key,
      sourceName: source.name,
    },
  };
}

/** 列表接口不给播放地址的源：爬详情页 HTML 提取 m3u8 */
export function parseDetailPageHtml(html: string, source: SourceConfig): VideoDetail {
  let matches = html.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
  if (matches.length === 0) {
    matches = html.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g) || [];
  }
  const episodes = [...new Set(matches)].map((link) => {
    let u = link.substring(1);
    const parenIndex = u.indexOf('(');
    if (parenIndex > 0) u = u.substring(0, parenIndex);
    return u;
  });
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  return {
    episodes,
    videoInfo: {
      title: titleMatch ? titleMatch[1].trim() : undefined,
      sourceKey: source.key,
      sourceName: source.name,
    },
  };
}

function extractM3u8FromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\$https?:\/\/[^"'\s]+?\.m3u8/g) || [];
  return matches.map((link) => link.replace(/^\$/, ''));
}

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

// ---------------------------------------------------------------- 请求

export async function searchSource(
  source: SourceConfig,
  wd: string
): Promise<SearchResultItem[]> {
  const data = await httpJson<unknown>({
    url: apiUrl(source, { wd }),
    headers: cmsHeaders(),
    timeoutSecs: 12,
  });
  return parseSearchList(data, source);
}

export async function getDetail(
  source: SourceConfig,
  vodId: string
): Promise<VideoDetail> {
  const data = await httpJson<unknown>({
    url: apiUrl(source, { ids: vodId }),
    headers: cmsHeaders(),
    timeoutSecs: 12,
  });
  let detail = parseDetail(data, source);
  if (detail.episodes.length === 0 && source.detail) {
    // 列表接口无播放地址：爬详情页
    const html = await httpText({
      url: `${source.detail}/index.php/vod/detail/id/${vodId}.html`,
      headers: { 'User-Agent': UA },
      timeoutSecs: 12,
    });
    detail = parseDetailPageHtml(html, source);
  }
  return detail;
}

// ---------------------------------------------------------------- 结果过滤

const ADULT_KEYWORDS = [
  '伦理片', '福利', '倫理片', '福利片', '日本伦理', '日本福利', '擦边', '里番动漫',
  '门事件', '萝莉少女', '制服诱惑', '无码', '有码', 'SWAG', '色情片', '自拍偷拍',
];

export function isAdultContent(typeName?: string): boolean {
  if (!typeName) return false;
  return ADULT_KEYWORDS.some((k) => typeName.includes(k));
}

/** 归一化标题：去空白与标点，转小写 */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

interface ParsedSeason {
  base: string;
  season: number;
  explicit: boolean;
}

function parseSeasonSuffix(
  title: string,
  allowAnnotations = false,
  bareNeedsSpace = true
): ParsedSeason | undefined {
  const explicitPattern = allowAnnotations
    ? /^(.*?)\s*第\s*([1-9]\d?|[一二两三四五六七八九十]{1,3})\s*季.*$/u
    : /^(.*?)\s*第\s*([1-9]\d?|[一二两三四五六七八九十]{1,3})\s*季$/u;
  const explicit = title.trim().match(explicitPattern);
  const bare = title.trim().match(bareNeedsSpace ? /^(.*?)\s+([1-9]\d?)$/u : /^(.*?)\s*([1-9]\d?)$/u);
  const match = explicit ?? bare;
  if (!match || !normalizeTitle(match[1])) return undefined;
  const value = match[2];
  const digits = '零一二三四五六七八九';
  let season = Number(value);
  if (!Number.isFinite(season)) {
    const chinese = value.replace('两', '二');
    if (/^[一二三四五六七八九]$/u.test(chinese)) season = digits.indexOf(chinese);
    else if (/^[一二三四五六七八九]?十[一二三四五六七八九]?$/u.test(chinese)) {
      const [tens, units] = chinese.split('十');
      season = (tens ? digits.indexOf(tens) : 1) * 10 + (units ? digits.indexOf(units) : 0);
    }
  }
  if (!Number.isFinite(season)) return undefined;
  return { base: match[1], season, explicit: Boolean(explicit) };
}

function includesKeyword(title: string, keyword: string): boolean {
  if (!title || !keyword) return false;
  let index = title.indexOf(keyword);
  while (index >= 0) {
    const before = title[index - 1] ?? '';
    const after = title[index + keyword.length] ?? '';
    if ((!/^\d/u.test(keyword) || !/\d/u.test(before)) &&
        (!/\d$/u.test(keyword) || !/\d/u.test(after))) return true;
    index = title.indexOf(keyword, index + 1);
  }
  return false;
}

interface PreparedQuery {
  normalized: string;
  season?: ParsedSeason;
  tokens: string[];
}

function prepareQuery(wd: string): PreparedQuery | undefined {
  const normalized = normalizeTitle(wd);
  if (!normalized) return undefined;
  return {
    normalized,
    season: parseSeasonSuffix(wd, false, false),
    tokens: wd.trim().split(/\s+/).map(normalizeTitle).filter(Boolean),
  };
}

function isRelevantPrepared(name: string, query: PreparedQuery): boolean {
  const nName = normalizeTitle(name);
  if (!nName) return false;
  const titleSeason = parseSeasonSuffix(name, true);
  if (query.season && titleSeason) {
    if (query.season.season !== titleSeason.season) return false;
    if (query.season.explicit || titleSeason.explicit) {
      const baseQuery = prepareQuery(query.season.base);
      if (baseQuery) {
        return includesKeyword(normalizeTitle(titleSeason.base), baseQuery.normalized) ||
          (baseQuery.tokens.length > 1 && baseQuery.tokens.every((t) => includesKeyword(normalizeTitle(titleSeason.base), t)));
      }
    }
  }
  if (includesKeyword(nName, query.normalized)) return true;
  return query.tokens.length > 1 && query.tokens.every((t) => includesKeyword(nName, t));
}

export function isRelevant(name: string, wd: string): boolean {
  const query = prepareQuery(wd);
  if (!query) return true;
  return isRelevantPrepared(name, query);
}

export function filterRelevantResults<T extends { name?: string }>(
  items: T[],
  wd: string
): T[] {
  const query = prepareQuery(wd);
  if (!query) return items;
  return items.filter((item) => isRelevantPrepared(item.name || '', query));
}
