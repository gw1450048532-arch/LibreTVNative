// 播放器：ArtPlayer + hls.js，媒体一律走 stream:// 代理
// 注意：ArtPlayer v5 的样式已内置在 JS 中，无需单独引入 CSS
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { proxiedUrl } from './api';
import { toast } from './ui';

export interface PlayOptions {
  url: string;
  referer?: string;
  container: HTMLDivElement;
  /** 续播位置（秒） */
  position?: number;
  onProgress?: (position: number, duration: number) => void;
}

export interface PlayerHandle {
  art: Artplayer;
  destroy: () => void;
}

export async function createPlayer(opts: PlayOptions): Promise<PlayerHandle> {
  const target = await proxiedUrl(opts.url, opts.referer);
  const isHls = /\.m3u8(\?|$)/i.test(opts.url) || /mpegurl/i.test(opts.url);

  const art = new Artplayer({
    container: opts.container,
    url: target,
    type: isHls ? 'm3u8' : 'mp4',
    customType: isHls
      ? {
          m3u8: (video, url) => {
            const hls = new Hls({
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
            });
            hls.loadSource(url);
            hls.attachMedia(video as HTMLVideoElement);
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (data.fatal) {
                toast(`播放出错：${data.details || '未知错误'}`);
              }
            });
          },
        }
      : undefined,
    autoSize: false,
    fullscreen: true,
    playbackRate: true,
    theme: '#3b82f6',
  });

  if (opts.position && opts.position > 3) {
    art.once('ready', () => {
      try {
        art.currentTime = opts.position as number;
      } catch {
        /* 某些源 seek 可能失败，忽略 */
      }
    });
  }

  let lastSave = 0;
  const timer = window.setInterval(() => {
    if (!art.duration || art.duration <= 0) return;
    if (Date.now() - lastSave < 4000) return;
    lastSave = Date.now();
    opts.onProgress?.(art.currentTime, art.duration);
  }, 2000);

  return {
    art,
    destroy: () => {
      window.clearInterval(timer);
      try {
        art.destroy(false);
      } catch {
        /* ignore */
      }
    },
  };
}
