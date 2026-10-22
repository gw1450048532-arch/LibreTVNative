// 应用入口：hash 路由 + 底部导航
import './styles.css';
import { clear, h } from './ui';
import { renderHome } from './pages/home';
import { renderWatch } from './pages/watch';
import { renderSettings } from './pages/settings';

const app = document.querySelector<HTMLElement>('#app')!;

function nav(): HTMLElement {
  const current = location.hash.slice(1) || '/';
  const item = (path: string, label: string) =>
    h('a', {
      class: `nav-item${current.startsWith(path) ? ' active' : ''}`,
      href: `#${path}`,
      text: label,
    });
  return h('nav', { class: 'nav' }, [item('/', '首页'), item('/settings', '设置')]);
}

function route(): void {
  clear(app);
  const hash = location.hash.slice(1) || '/';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query ?? '');
  if (path.startsWith('/watch')) renderWatch(app, params);
  else if (path.startsWith('/settings')) renderSettings(app);
  else renderHome(app);
  app.append(nav());
}

window.addEventListener('hashchange', route);
route();
