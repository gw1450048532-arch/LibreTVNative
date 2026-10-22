// 设置：源管理（增删 / 启用 / 测试）、订阅导入导出、成人过滤
import { h, clear, toast } from '../ui';
import {
  addSource,
  getSettings,
  getSources,
  normalizeUrl,
  removeSource,
  setSourceEnabled,
  updateSettings,
} from '../store';
import { searchSource } from '../cms';
import { httpText } from '../api';
import type { SourceConfig } from '../types';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '未命名源';
  }
}

/** 订阅内容 → 点播源数组。支持 LibreTV-SourceList JSON 与 TVBOX 配置 */
function extractSources(data: unknown): Omit<SourceConfig, 'key'>[] {
  const out: Omit<SourceConfig, 'key'>[] = [];
  const push = (name: unknown, url: unknown, isAdult?: unknown) => {
    const u = typeof url === 'string' ? normalizeUrl(url) : '';
    if (!u || !/^https?:\/\//i.test(u)) return;
    out.push({
      name: (typeof name === 'string' && name.trim()) || hostOf(u),
      url: u,
      isAdult: isAdult === true,
    });
  };

  if (Array.isArray(data)) {
    for (const item of data) {
      const it = item as Record<string, unknown>;
      push(it.name, it.url ?? it.api, it.isAdult);
    }
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.sources)) {
      for (const item of obj.sources) {
        const it = item as Record<string, unknown>;
        push(it.name, it.url, it.isAdult);
      }
    }
    if (Array.isArray(obj.sites)) {
      // TVBOX 配置：只导入 type=1（或省略但地址命中 provide/vod）的苹果 CMS 站
      for (const item of obj.sites) {
        const it = item as Record<string, unknown>;
        const api = typeof it.api === 'string' ? it.api : '';
        const isCms = it.type === 1 || (it.type === undefined && api.includes('api.php/provide/vod'));
        if (isCms && it.searchable !== 0) push(it.name, api, it.isAdult);
      }
    }
  }
  return out;
}

export function renderSettings(root: HTMLElement): void {
  // ---------------- 源列表 ----------------
  const listBox = h('div', {});
  function renderList(): void {
    clear(listBox);
    const sources = getSources();
    if (sources.length === 0) {
      listBox.append(h('div', { class: 'hint', text: '还没有任何源，请在下方添加或导入订阅。' }));
      return;
    }
    for (const s of sources) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = s.enabled !== false;
      cb.addEventListener('change', () => setSourceEnabled(s.key, cb.checked));

      const testBtn = h('button', { class: 'btn ghost small', text: '测试' });
      testBtn.addEventListener('click', async () => {
        testBtn.textContent = '…';
        try {
          const list = await searchSource(s, 'test');
          testBtn.textContent = `可用 ${list.length}`;
        } catch {
          testBtn.textContent = '失败';
        }
      });

      const delBtn = h('button', { class: 'btn danger small', text: '删除' });
      delBtn.addEventListener('click', () => {
        removeSource(s.key);
        renderList();
        toast(`已删除 ${s.name}`);
      });

      listBox.append(
        h('div', { class: 'source-row' }, [
          cb,
          h('div', { class: 's-name' }, [
            h('div', { class: 'n', text: s.name }),
            h('div', { class: 'u', text: s.url }),
          ]),
          testBtn,
          delBtn,
        ])
      );
    }
  }
  renderList();

  // ---------------- 添加源 ----------------
  const nameInput = h('input', { type: 'text', placeholder: '名称（可选）' });
  const urlInput = h('input', {
    type: 'url',
    placeholder: 'https://example.com/api.php/provide/vod',
  });
  const addBtn = h('button', { class: 'btn', text: '添加' });
  addBtn.addEventListener('click', () => {
    const url = normalizeUrl(urlInput.value);
    if (!url) {
      toast('请输入采集站 API 地址');
      return;
    }
    if (getSources().some((s) => s.url === url)) {
      toast('该地址已存在');
      return;
    }
    addSource({ name: nameInput.value.trim() || hostOf(url), url });
    urlInput.value = '';
    nameInput.value = '';
    renderList();
    toast('已添加');
  });

  // ---------------- 订阅导入 ----------------
  const subInput = h('input', {
    type: 'url',
    placeholder: '订阅地址：LibreTV-SourceList JSON 或 TVBOX 配置',
  });
  const importBtn = h('button', { class: 'btn ghost', text: '导入订阅' });
  importBtn.addEventListener('click', async () => {
    const url = subInput.value.trim();
    if (!url) {
      toast('请输入订阅地址');
      return;
    }
    importBtn.textContent = '导入中…';
    try {
      const data = JSON.parse(await httpText({ url, timeoutSecs: 15 }));
      const found = extractSources(data);
      if (found.length === 0) {
        toast('订阅里没有可导入的点播源');
        return;
      }
      const existing = new Set(getSources().map((s) => s.url));
      let added = 0;
      for (const s of found) {
        if (!existing.has(s.url)) {
          addSource(s);
          added += 1;
        }
      }
      renderList();
      const skipped = found.length - added;
      toast(`导入完成：新增 ${added} 个源${skipped > 0 ? `，跳过 ${skipped} 个重复` : ''}`);
    } catch (e) {
      toast(`导入失败：${e instanceof Error ? e.message : '内容格式不正确'}`);
    } finally {
      importBtn.textContent = '导入订阅';
    }
  });

  // ---------------- 导出 ----------------
  const exportBtn = h('button', { class: 'btn ghost', text: '导出源' });
  exportBtn.addEventListener('click', () => {
    const payload = {
      name: 'LibreTV 导出',
      version: 2,
      sources: getSources().map(({ key: _key, ...rest }) => rest),
      liveSources: [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'libretv-sources.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出源配置');
  });

  // ---------------- 偏好 ----------------
  const settings = getSettings();
  const adultCb = h('input', { type: 'checkbox' });
  adultCb.checked = settings.adultFilter;
  adultCb.addEventListener('change', () => updateSettings({ adultFilter: adultCb.checked }));

  root.append(
    h('div', { class: 'settings-section' }, [
      h('h2', { text: '采集源' }),
      listBox,
      h('div', { class: 'form-row', style: 'margin-top:12px' }, [nameInput, addBtn]),
      h('div', { class: 'form-row' }, [urlInput]),
      h('div', { class: 'form-row' }, [subInput, importBtn]),
      h('div', { class: 'form-row' }, [exportBtn]),
      h('div', {
        class: 'hint',
        text: '源配置与观看记录只保存在本机。导入支持 LibreTV-SourceList JSON 与 TVBOX 配置（自动识别）。',
      }),
    ]),
    h('div', { class: 'settings-section' }, [
      h('h2', { text: '偏好' }),
      h('label', { class: 'switch' }, [
        adultCb,
        h('span', { text: '过滤成人内容（默认开启）' }),
      ]),
    ]),
    h('div', { class: 'settings-section' }, [
      h('h2', { text: '关于' }),
      h('div', {
        class: 'hint',
        text: 'LibreTV Native — 免部署直装的跨平台影视聚合客户端。基于 Tauri 2.0，前端与播放逻辑衍生自 LibreTV（AGPL-3.0），本项目同样以 AGPL-3.0 发布。不存储、不制作任何视频内容，所有资源来自用户自行配置的第三方接口。',
      }),
    ])
  );
}
