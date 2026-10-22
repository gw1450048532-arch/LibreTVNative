// 首页：多源并行搜索 + 同名聚合
import { h, clear, go, toast } from '../ui';
import { getEnabledSources } from '../store';
import { filterRelevantResults, isAdultContent, normalizeTitle, searchSource } from '../cms';
import { proxiedUrl, refererOf } from '../api';
import type { SearchResultItem } from '../types';

export function renderHome(root: HTMLElement): void {
  const state = {
    wd: '',
    results: [] as SearchResultItem[],
    failures: new Set<string>(),
    searching: false,
    searched: false,
  };

  const chipsBox = h('div', { class: 'chips' });
  const statusBox = h('div', {});
  const grid = h('div', { class: 'grid' });

  function renderChips(): void {
    clear(chipsBox);
    const sources = getEnabledSources();
    if (sources.length === 0) {
      chipsBox.append(
        h('span', { class: 'chip', text: '还没有启用任何源 → 去设置添加', onclick: () => go('/settings') })
      );
      return;
    }
    for (const s of sources) {
      chipsBox.append(
        h('span', {
          class: `chip${state.failures.has(s.key) ? ' fail' : ''}`,
          text: s.name,
          title: s.url,
          onclick: () =>
            toast(state.failures.has(s.key) ? `${s.name}：本次搜索失败` : s.url, 3500),
        })
      );
    }
  }

  function renderStatus(): void {
    clear(statusBox);
    if (state.searching) {
      statusBox.append(h('div', { class: 'loading', text: '搜索中…' }));
    } else if (state.searched && state.results.length === 0) {
      statusBox.append(h('div', { class: 'empty', text: '没有找到相关结果' }));
    }
  }

  function renderResults(): void {
    clear(grid);
    // 同名影片合并为一张卡片（跨源比较为后续能力）
    const groups = new Map<string, SearchResultItem[]>();
    for (const item of state.results) {
      const key = normalizeTitle(item.name) || `${item.sourceKey}:${item.vodId}`;
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    for (const items of groups.values()) {
      const first = items[0];
      const poster = h('div', { class: 'poster' });
      const meta = [first.year, first.typeName, first.remarks].filter(Boolean).join(' · ');
      const card = h('div', { class: 'card' }, [
        poster,
        h('div', { class: 'name', text: first.name }),
        h('div', {
          class: 'meta',
          text: meta + (items.length > 1 ? ` · ${items.length} 个源` : ''),
        }),
      ]);
      card.addEventListener('click', () =>
        go(`/watch?src=${encodeURIComponent(first.sourceKey)}&id=${encodeURIComponent(first.vodId)}`)
      );
      if (first.pic) {
        void (async () => {
          try {
            poster.append(h('img', { src: await proxiedUrl(first.pic as string, refererOf(first.pic as string)), alt: first.name, loading: 'lazy' }));
          } catch {
            /* 封面失败不阻塞 */
          }
        })();
      }
      grid.append(card);
    }
  }

  async function doSearch(): Promise<void> {
    const wd = state.wd.trim();
    if (!wd) return;
    const sources = getEnabledSources();
    if (sources.length === 0) {
      toast('请先在设置里添加并启用采集源');
      go('/settings');
      return;
    }
    state.searching = true;
    state.searched = true;
    state.failures.clear();
    renderStatus();

    const settled = await Promise.allSettled(sources.map((s) => searchSource(s, wd)));
    const all: SearchResultItem[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') all.push(...r.value);
      else state.failures.add(sources[i].key);
    });

    const list = filterRelevantResults(all, wd);
    state.results = list;
    state.searching = false;
    renderChips();
    renderResults();
    renderStatus();
    if (state.failures.size > 0) {
      toast(`${state.failures.size} 个源搜索失败（红色标记）`);
    }
  }

  const input = h('input', {
    type: 'text',
    placeholder: '搜索片名，如：庆余年',
    value: state.wd,
  });
  input.addEventListener('input', () => {
    state.wd = input.value;
  });
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void doSearch();
  });

  const searchBtn = h('button', { class: 'btn', text: '搜索', onclick: () => void doSearch() });

  root.append(
    h('div', { class: 'search-bar' }, [input, searchBtn]),
    chipsBox,
    statusBox,
    grid
  );
  renderChips();
}
