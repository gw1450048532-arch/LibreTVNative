# LibreTV Native — 交付运行手册

> 目标：**拿到就能出安装包**。本项目代码已完整，无需任何补充修改。
> 推荐路径 A（云端构建，本机不用装 Rust）；备选路径 B（本机构建）。

---

## 路径 A：GitHub Actions 云端构建（推荐）

### A1. 推送代码到 GitHub

```bash
cd LibreTVNative

git init
git add -A
git commit -m "LibreTV Native v0.1.0"
git branch -M main

# 先在 GitHub 网页建一个空仓库（不要勾选 README/.gitignore），然后：
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

### A2. 触发构建

**方式一（手动，最快，不用打 tag）**：
仓库页面 → **Actions** → 左侧 **Release** → **Run workflow** → 选 `main` → **Run workflow**。

**方式二（打 tag，自动发布正式 Release）**：

```bash
git tag v0.1.0
git push origin v0.1.0
```

### A3. 下载产物

| 触发方式 | 下载位置 |
|---|---|
| 手动 Run workflow | 该次运行页面底部 **Artifacts**：`windows-installers`、`android-apk` |
| 打 tag | 仓库 **Releases** 页面直接下载 |

产物清单：
- `LibreTV_0.1.0_x64-setup.exe` — Windows 安装包（NSIS，双击安装）
- `LibreTV_0.1.0_x64_en-US.msi` — Windows MSI 安装包
- `LibreTV-android.apk` — 安卓安装包（已签名，传到手机即可安装）

> 首次构建约 10–20 分钟（要编译 Rust 依赖）。Windows 与 Android 两个 job 并行。

---

## 路径 B：本机构建

### B1. 前置依赖

| 工具 | 用途 | 安装 |
|---|---|---|
| Node 20+ | 前端构建 | https://nodejs.org |
| Rust (stable) | Tauri 壳 | https://rustup.rs （Windows 需再装 VS Build Tools 的「C++ 桌面开发」工作负载） |
| Android SDK + NDK 27 | 仅安卓 APK 需要 | Android Studio 或 `sdkmanager` |

### B2. Windows 安装包

```bash
cd LibreTVNative
npm install
npm run tauri build
```

产物在：
```
src-tauri/target/release/bundle/nsis/LibreTV_0.1.0_x64-setup.exe
src-tauri/target/release/bundle/msi/LibreTV_0.1.0_x64_en-US.msi
```

### B3. Android APK

```bash
cd LibreTVNative
npm install
npx tauri android init --ci          # 首次生成 gen/android（--ci 必须加）
npx tauri android build --apk        # 产物在 src-tauri/gen/android/app/build/outputs/apk/
```

> 用 Android Studio 直接打开 `src-tauri/gen/android` 也可以图形化构建/真机调试。

### B4. 开发调试（热重载）

```bash
npm install
npm run tauri dev      # 桌面端
npm run tauri android dev   # 安卓真机/模拟器
```

---

## 装好后怎么用

1. **启动**：双击安装后的 LibreTV。
2. **源已预置**：出厂自带 6 个公共采集站（失效很正常，采集站经常换域名）。
3. **加源**：底部「设置」→ 填名称 + 采集站地址（形如 `https://xxx.com/api.php/provide/vod`）→ 添加；或直接粘贴订阅地址导入（支持 LibreTV-SourceList JSON 和 TVBOX 配置，自动识别）。每个源可「测试」探活。
4. **搜索**：首页输入片名 → 回车。多源并行搜索，红色源名 = 该源本次失败；同名影片自动合并。
5. **播放**：点卡片 → 选剧集。HLS 与 MP4 都支持；进度自动保存，下次打开同片同集自动续播。
6. **配置迁移**：设置 → 导出源 / 导入订阅。

---

## 常见问题

**Q：搜索全部失败？**
采集站域名经常失效。去设置里逐个「测试」，删掉失效的，导入一份新的订阅。
订阅源可以在网上搜「LibreTV 源订阅」或「TVBOX 配置」获取（本项目不内置、不提供任何源）。

**Q：能播放但一直转圈？**
该源的 m3u8 需要特定 Referer 防盗链。本项目已按源自动补 Referer；若仍失败，换源即可。

**Q：安卓 APK 提示"应用未安装"？**
请在系统里允许「安装未知来源应用」。若之前装过同包名旧版，先卸载再装。

**Q：Windows 打开是白屏？**
确认是用安装包启动（而不是直接拖 exe）。WebView2 运行时缺失时去微软官网装「Edge WebView2 Runtime」。

**Q：想改成自己的包名/图标？**
包名：`src-tauri/tauri.conf.json` 的 `identifier`；图标：替换 `src-tauri/icons/` 后跑 `npm run tauri icon <你的图片>`。

**Q：想闭源商用？**
不行。前端衍生自 LibreTV（AGPL-3.0），本项目同样 AGPL-3.0，衍生作品必须同样开源。
若需闭源，改用 MIT 的上游（MoonTV）重写前端。

---

## 目录速查

```
LibreTVNative/
├── src/                 前端（Vite + TS）
│   ├── api.ts           invoke 封装 + stream:// 代理地址拼接
│   ├── cms.ts           苹果 CMS 解析（移植自 LibreTV）
│   ├── player.ts        ArtPlayer + hls.js
│   ├── store.ts         本地配置/进度持久化
│   └── pages/           home / watch / settings
├── src-tauri/           Rust 壳
│   ├── src/lib.rs       HTTP 命令 + stream:// 媒体代理 + m3u8 重写
│   └── tauri.conf.json  双端配置 + CSP
├── .github/workflows/   CI（Windows + Android）
├── LICENSE              AGPL-3.0
└── RUNBOOK.md           本文件
```
