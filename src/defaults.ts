// 出厂自带的公共采集站（失效可在设置里删；数据全部来自用户自行配置）
import type { SourceConfig } from './types';

export const DEFAULT_SOURCES: Omit<SourceConfig, 'key'>[] = [
  { name: '电影天堂', url: 'https://caiji.dyttzyapi.com/api.php/provide/vod' },
  { name: '暴风资源', url: 'https://bfzyapi.com/api.php/provide/vod' },
  { name: '非凡影视', url: 'http://ffzy5.tv/api.php/provide/vod', detail: 'http://ffzy5.tv' },
  { name: '如意资源', url: 'https://rycjapi.com/api.php/provide/vod' },
  { name: '最大资源', url: 'https://api.zuidapi.com/api.php/provide/vod' },
  { name: '360资源', url: 'https://360zy.com/api.php/provide/vod' },
];
