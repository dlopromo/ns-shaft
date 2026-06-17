# NS-SHAFT Browser Reconstruction

Windows 1.3J 版 NS-SHAFT 的瀏覽器忠實重製研究專案。專案以原版 Windows 1.3J 作主要視覺、音訊和規則基準，參考 iPel/NS-SHAFT 的成熟遊戲循環模型，使用 TypeScript、HTML5 Canvas、Web Audio/MIDI 和 deterministic simulation 實作。

## 狀態

目前版本已可在桌面瀏覽器以原始 `634x436` 邏輯尺寸遊玩，並支援整數倍 nearest-neighbor 縮放。主要可玩元素已接入原版資產：

- 原版標題、版權、遊戲框、背景、牆、尖刺、HUD、數字和排行榜字形
- 1P / 2P 本機雙人模式
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
- `Esc`：暫停 / 繼續
- `F`：全螢幕

遊戲目標是避開頂部尖刺和危險平台，沿平台不斷向下移動，盡量到達更深樓層。

## 專案結構

```text
src/
  game/          遊戲邏輯、渲染、音訊、輸入、存檔和座標配置
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

## 授權和資產

本專案參考 [iPel/NS-SHAFT](https://github.com/iPel/NS-SHAFT) 的遊戲架構，相關 attribution 見 [NOTICE](./NOTICE)。

原 NS-SHAFT 視覺和音訊資產屬於原作者 / 權利人。本 repo 內的原版封裝、解包資源和轉換資產只在專案擁有者已聲明具備分析、轉換和使用授權的前提下使用。若要公開發布、再分發或商業使用，請先確認你自己的授權狀態。

## 備註

此專案不是直接移植反編譯程式碼，而是以「靜態逆向 + 受控動態觀察 + clean-room 規格化」方式重建行為。仍未由原系統逐幀證實的物理常數，會在文件或測試中視為暫定行為。
