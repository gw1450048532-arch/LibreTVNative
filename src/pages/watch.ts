// 播放页：详情 + 剧集 + 播放器 + 本地续播
import { h, clear, go } from '../ui';
import { getDetail } from '../cms';
import { getSources, getProgress, saveProgress } from '../store';
import { refererOf } from '../api';
import { createPlayer, type PlayerHandle } from '../player';
import type { SourceConfig } from '../types';

export function renderWatch(root: HTMLElement, params: URLSearchParams): void {
  const srcKey = params.get('src') ?? '';
  const vodId = params.get('id') ?? '';
  const found: SourceConfig | undefined = getSources().find((s) => s.key === srcKey);

  if (!found) {
    root.append(h('div', { class: 'empty', text: '源不存在或已删除' }));
    return;
  }
  // 收窄为确定类型，供后续闭包使用
  const source: SourceConfig = found;

  const playerBox = h('div', { class: 'player-wrap' });
  const infoBox = h('div', { class: 'detail-head' });
  const epsTitle = h('div', { class: 'section-title', text: '剧集' });
  const epsBox = h('div', { class: 'episodes' });

  let player: PlayerHandle | null = null;
  let episodes: string[] = [];
  let currentEp = 0;
  let name = '';
  let pic: string | undefined;

  function renderInfo(title: string, meta: string, desc: string): void {
    clear(infoBox);
    infoBox.append(
      h('div', { class: 'cover' }, [pic ? h('img', { src: pic, alt: title }) : h('div')]),
      h('div', { class: 'info' }, [
        h('h1', { text: title }),
        h('div', { class: 'sub', text: meta }),
        h('div', { class: 'desc', text: desc }),
      ])
    );
  }

  function renderEpisodes(): void {
    clear(epsBox);
    const progress = getProgress(source.key, vodId);
    episodes.forEach((_, i) => {
      const btn = h('button', {
        class: `ep-btn${i === currentEp ? ' on' : ''}${progress?.episode === i ? ' watched' : ''}`,
        text: `第 ${i + 1} 集`,
      });
      btn.addEventListener('click', () => void play(i));
      epsBox.append(btn);
    });
  }

  async function play(index: number): Promise<void> {
    const url = episodes[index];
    if (!url) return;
    currentEp = index;
    player?.destroy();
    clear(playerBox);

    const progress = getProgress(source.key, vodId);
    const resume = progress && progress.episode === index ? progress.position : 0;

    try {
      player = await createPlayer({
        container: playerBox,
        url,
        referer: refererOf(url) ?? (source.detail ? refererOf(source.detail) : undefined),
        position: resume,
        onProgress: (position, duration) => {
          if (position < 3) return;
          saveProgress({
            sourceKey: source.key,
            vodId,
            name,
            pic,
            episode: index,
            position,
            duration,
            updatedAt: Date.now(),
          });
        },
      });
    } catch (e) {
      playerBox.append(
        h('div', { class: 'empty', text: `播放失败：${e instanceof Error ? e.message : '未知错误'}` })
      );
    }
    renderEpisodes();
  }

  root.append(playerBox, infoBox, epsTitle, epsBox);
  infoBox.append(h('div', { class: 'loading', text: '加载中…' }));

  void (async () => {
    try {
      const detail = await getDetail(source, vodId);
      episodes = detail.episodes;
      name = detail.videoInfo.title ?? '';
      pic = detail.videoInfo.cover;
      const meta = [detail.videoInfo.year, detail.videoInfo.area, detail.videoInfo.typeName, detail.videoInfo.remarks]
        .filter(Boolean)
        .join(' · ');
      renderInfo(name, `${source.name} · ${meta}`, detail.videoInfo.desc ?? '');
      if (episodes.length === 0) {
        clear(epsBox);
        epsBox.append(h('div', { class: 'empty', text: '该源没有解析到可播放地址，请回首页换其他源' }));
        const back = h('button', { class: 'btn ghost', text: '返回首页', onclick: () => go('/') });
        epsBox.append(back);
        return;
      }
      await play(0);
    } catch (e) {
      clear(infoBox);
      infoBox.append(
        h('div', { class: 'empty', text: `加载失败：${e instanceof Error ? e.message : '未知错误'}` })
      );
      const back = h('button', { class: 'btn ghost', text: '返回首页', onclick: () => go('/') });
      infoBox.append(back);
    }
  })();
}
