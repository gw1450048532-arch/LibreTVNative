// 数据模型（与 LibreTV 上游保持兼容的苹果 CMS 结构）

export interface SourceConfig {
  /** 唯一标识 */
  key: string;
  name: string;
  /** API 根地址，如 https://example.com/api.php/provide/vod */
  url: string;
  /** 可选：详情页根地址（部分源需要爬详情页提取 m3u8） */
  detail?: string;
  isAdult?: boolean;
  /** 是否参与搜索，默认 true */
  enabled?: boolean;
}

export interface SearchResultItem {
  sourceKey: string;
  sourceName: string;
  vodId: string;
  name: string;
  pic?: string;
  typeName?: string;
  year?: string;
  area?: string;
  remarks?: string;
}

export interface VideoInfo {
  title?: string;
  cover?: string;
  desc?: string;
  typeName?: string;
  year?: string;
  area?: string;
  director?: string;
  actor?: string;
  remarks?: string;
  sourceKey: string;
  sourceName: string;
}

export interface VideoDetail {
  episodes: string[];
  videoInfo: VideoInfo;
}

export interface HistoryEntry {
  sourceKey: string;
  vodId: string;
  name: string;
  pic?: string;
  /** 当前集下标 */
  episode: number;
  /** 播放位置（秒） */
  position: number;
  duration: number;
  updatedAt: number;
}

export interface Settings {
  /** 过滤成人内容 */
  adultFilter: boolean;
}
