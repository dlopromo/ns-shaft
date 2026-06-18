# NS-SHAFT Browser Reconstruction

Windows 1.3J 版 NS-SHAFT 的瀏覽器忠實重製研究專案。專案以原版 Windows 1.3J 作主要視覺、音訊和規則基準，參考 iPel/NS-SHAFT 的成熟遊戲循環模型，使用 TypeScript、HTML5 Canvas、Web Audio/MIDI 和 deterministic simulation 實作。

## 狀態

目前版本已可在桌面瀏覽器以原始 `634x436` 邏輯尺寸遊玩，並支援整數倍 nearest-neighbor 縮放。主要可玩元素已接入原版資產：

- 原版標題、版權、遊戲框、背景、牆、尖刺、HUD、數字和排行榜字形
- 1P / 2P 本機雙人模式
- 實驗性 Online 2P：6 位全數字房間碼、Co-op lockstep，以及可同步觀看對方動作的 Split Race
- 普通平台、輸送帶、翻滾/消失平台、彈弓、尖刺和頂部壓迫
- 12 格 LIFE、樓層計分、右側難度和 RECORD 顯示
- 原版 WAVE 音效事件映射和 MIDI BGM 播放
- `localStorage` 設定、Best 5 紀錄和姓名輸入
- Browser QA 截圖、像素檢查和 deterministic 測試接口

仍在研究中的項目記錄於 [progress.md](./progress.md)。

## 快速開始

```bash
npm install
npm run dev
```

然後開啟 Vite 顯示的本機網址。

常用命令：

```bash
npm test -- --run
npm run build
npm run test:browser
npm run test:cross-browser
```

資產重建命令：

```bash
npm run assets:web
npm run assets:native
npm run research
```

## 操作

- 1P：方向鍵左右移動
- 2P：1P 使用方向鍵，2P 使用 `Z` / `X`
- Online 2P：選擇 `Co-op 2P` 或 `Split Race`，建立房間後會自動複製 6 位數字 code；兩邊按 Ready 後倒數 5 秒開始
- `Esc`：暫停 / 繼續
- `F`：全螢幕

遊戲目標是避開頂部尖刺和危險平台，沿平台不斷向下移動，盡量到達更深樓層。

## Online 2P 設定

Online mode 使用 Firebase Realtime Database 作輕量同步層。不要把 API key 或 Firebase 設定貼到聊天或 commit 入 repo；本機請建立 `.env.local`：

```bash
cp .env.example .env.local
```

然後填入你的 Firebase web app 設定：

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

目前提供兩種 WAN 房間模式：

- `Co-op 2P`：兩位玩家在同一畫面互動，使用固定延遲 lockstep 同步每 tick input。任何一方死亡後會繼續跌出畫面，另一方仍可繼續遊玩；兩人都死亡才 Game Over。
- `Split Race`：自己使用原尺寸 `634x436` 機台，右方以精確 50% 尺寸 `317x218` 顯示對手機台。每位玩家在自己的瀏覽器都是黃色 1P，對手則以綠色 2P 角色顯示。雙方使用同一 seed、難度和機關設定，各自即時操作 1P simulation，並約每 `100ms` 同步 snapshot；遠端畫面使用 `100ms` interpolation buffer 減少 WAN 抖動。

兩邊 Ready 後由 host 以 Firebase server time 啟動 `5, 4, 3, 2, 1, GO`。Co-op 會在兩位玩家都死亡後結算；Split Race 先完成的一方可觀看對手，雙方完成後顯示結果 3 秒。兩種模式都會自動回到同一房間、保留設定並清除 Ready，毋須按 Abort 便可再戰；Abort 只用作離開房間。

房間內的 P1/P2 列會以灰色、黃色和綠色分別顯示等待、已連線和已 Ready。建房時會嘗試把 code 寫入剪貼簿；若瀏覽器拒絕權限，可按 `Copy Code` 重試，或直接複製已自動選取的 code。

Online 分數暫不寫入本機 Best 5，以免與原版單機紀錄混淆。

如本機已啟動在 `http://127.0.0.1:5175`，可用 `npm run test:firebase`
開兩個隔離 browser context，實測兩種模式的建房、clipboard、入房、Ready、
5 秒倒數、遊戲同步、結果、自動同房再戰及測試房清理。此測試會在 Firebase 建立短暫房間。

## 專案結構

```text
src/
  game/          遊戲邏輯、渲染、音訊、輸入、存檔和座標配置
  game/online/   Firebase 房間、6 位房間碼和 deterministic lockstep
tests/           Vitest 單元測試、Playwright/browser QA 腳本
tools/           原資源抽取、轉換、分析和 sprite sheet 生成工具
public/assets/   原始提取資源、Web 轉換資產和 BGM
docs/            研究文件
artifacts/       分析、QA 截圖和本地產物
```

重要檔案：

- [src/game/simulation.ts](./src/game/simulation.ts)：deterministic simulation、平台生成、碰撞和生命規則
- [src/game/renderer.ts](./src/game/renderer.ts)：Canvas 原尺寸渲染和 HUD
- [src/game/atlas.ts](./src/game/atlas.ts)：原版 sprite source rectangles、anchor 和 collision 定義
- [src/game/layout.ts](./src/game/layout.ts)：634x436 原版 frame 內的座標配置
- [src/game/online/](./src/game/online/)：Online 2P room/session/lockstep/controller
- [tests/browser-qa.mjs](./tests/browser-qa.mjs)：瀏覽器流程、像素審核和截圖

## 遊戲生成規則

平台生成遵循 iPel 風格的固定行距模型，每行一個平台並由底部補滿畫面。現行保護規則包括：

- 所有平台保持在藍色遊玩區內，不會生成到左右牆外。
- 若平台與牆之間只剩小於角色碰撞寬度 `26px` 的假入口，會自動貼牆。
- 若貼牆會破壞可達性，會保留剛好可容納角色的入口。
- 每個新生成平台會以最近上一層作 anchor，使三層內一定存在可直接到達的平台。

## 測試策略

測試分三層：

- Vitest：simulation、storage、audio、atlas、layout 和動畫 timing
- Browser QA：Chromium 實際 canvas 流程、原尺寸截圖和像素審核
- Cross-browser QA：Chromium、Firefox、WebKit 基本流程

完整驗證建議：

```bash
npm test -- --run
npm run build
npm run test:browser
npm run test:cross-browser
```
