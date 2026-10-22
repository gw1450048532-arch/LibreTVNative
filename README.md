# LibreTV Native 📺

**免部署直装的跨平台影视聚合客户端** —— 下载安装包即用，无需服务器、无需 Docker、无账号。

基于 **Tauri 2.0**（Rust 壳 + 系统 WebView）+ Vite + TypeScript，播放内核 ArtPlayer + hls.js。
前端与播放逻辑衍生自 [LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL-3.0），本项目同样以 **AGPL-3.0-or-later** 发布。

## 它解决什么问题

同类项目（LibreTV / MoonTV 等）都是需要自己部署的 Web 应用；能"直装"的客户端（LibreTV-App）又已停滞维护且把源硬编码在 Rust 里。
本项目：**现代前端 + 可维护的双端直装壳**，源全部由用户在 App 内配置，存本机。

## 核心特性

- **免部署直装**：Windows 安装包 / Android APK，装上就用；无账号、无服务器、无远程数据库
- **多源并行搜索**：勾选多个苹果 CMS（Apple CMS）采集站并行搜索，同名影片合并展示，失败源标记
- **强播放能力**：HLS（m3u8）与 MP4，倍速、全屏、自动连播；精确到秒的本地续播
- **防盗链 / CORS 全链路解决**：所有 API 与媒体请求经 Rust 侧发出（采集站 API 基本无 CORS 头，纯 WebView 直连必挂）
- **源订阅**：支持导入 LibreTV-SourceList JSON 与 TVBOX 配置（自动识别），可导出分享
- **移动优先 UI**：手机 / 平板 / 桌面一套界面，深色主题
- **本地隐私**：源配置、观看历史、播放进度全部只存本机（localStorage）

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│ 前端（Vite + TS，静态产物 dist/）                              │
│   首页搜索 / 播放页 / 设置页                                    │
│   ArtPlayer + hls.js                                          │
└──────────────┬──────────────────────────────────────────────┘
               │ invoke() 命令               stream:// 自定义协议
┌──────────────▼──────────────────────────────────────────────┐
│ Rust 壳（src-tauri/）                                         │
│   http_request / http_binary   通用请求（绕 CORS，带自定义头）  │
│   stream:// 媒体代理            补 Referer、透传 Range、       │
│                                 m3u8 内分片地址重写为代理地址   │
└─────────────────────────────────────────────────────────────┘
```

播放链路：前端把 m3u8 地址包成 `http://stream.localhost/{profile}/{url}` → hls.js 用默认 loader 请求 →
Rust 代理补上该源的 Referer/UA 抓取 → 重写播放列表里的分片地址也走代理 → 分片逐段经代理播放。
`profile` 是前端按源登记的请求头档案，源地址不硬编码在 Rust 里。

## 开发

前置：Node 18+、Rust（stable）、Tauri 2  prerequisites（Windows 需 WebView2，Android 需 SDK/NDK）。

```bash
npm install
npm run tauri dev        # 桌面端开发（http://localhost:5173）
npm run build            # 仅构建前端
npm run tauri build      # 打包当前平台安装包
```

## 构建发布包

### Windows（本机）

```bash
npm run tauri build      # 产物：src-tauri/target/release/bundle/{nsis,msi}/
```

### Android（APK）

```bash
npx tauri android init   # 首次生成 gen/android（需要 Android SDK + NDK）
npx tauri android build  # 产物在 src-tauri/gen/android/app/build/outputs/apk/
```

### GitHub Actions（推荐，免本地装工具链）

推 tag 自动构建并上传 Release：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

CI 矩阵：`windows-latest` 出 NSIS/MSI 安装包，`ubuntu-latest` 出 Android APK（arm64 + arm32）。

## 目录结构

```
LibreTVNative/
├── index.html                  # 入口
├── src/                        # 前端（Vite + TS）
│   ├── main.ts                 # hash 路由 + 底部导航
│   ├── api.ts                  # invoke 封装 + 代理地址拼接
│   ├── cms.ts                  # 苹果 CMS 客户端与解析（移植自 LibreTV）
│   ├── store.ts                # 本地持久化（源/设置/进度）
│   ├── player.ts               # ArtPlayer + hls.js
│   ├── defaults.ts             # 出厂公共源（可删）
│   └── pages/                  # home / watch / settings
├── src-tauri/                  # Rust 壳
│   ├── src/lib.rs              # HTTP 命令 + stream:// 代理 + m3u8 重写
│   ├── tauri.conf.json         # 双端配置 + CSP
│   └── capabilities/           # 权限
└── .github/workflows/          # 发布 CI
```

## 路线图

- [x] 源管理 + 多源并行搜索 + 同名聚合
- [x] HLS/MP4 播放 + 续播 + 进度记录
- [x] 源订阅导入导出（LibreTV-SourceList / TVBOX）
- [x] stream:// 代理（防盗链 + Range + m3u8 重写）
- [ ] 卡片内"换源"（同名多源一键切换保留集数位置）
- [ ] 源健康度自动停用（连续失败阶梯拉黑）
- [ ] 广告分片过滤（URL 特征 + 片头启发式，LibreTV 已有实现待移植）
- [ ] 跳过片头片尾标记
- [ ] 豆瓣 / Bangumi 首页推荐
- [ ] 直播 / IPTV（M3U + EPG）
- [ ] PWA（浏览器场景）

## 免责声明

本项目不存储、不制作、不分发任何视频内容，仅提供第三方公开接口的聚合与播放能力，内容合法性由对应数据源负责。
请遵守当地法律法规，仅用于个人学习与研究。
