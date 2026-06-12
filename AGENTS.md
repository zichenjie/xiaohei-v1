# Repository Guidelines（仓库指南）

## 项目结构与模块组织

本仓库是一个基于 TypeScript、Electron、Vite、React、Pixi 和 Live2D 的 Windows 桌宠应用。主进程代码位于 `src/main/`，预加载脚本位于 `src/preload/`，共享类型、IPC 契约和默认配置位于 `src/shared/`。渲染端分为 `src/renderer/pet/` 桌宠窗口和 `src/renderer/settings/` 设置窗口。单元测试位于 `tests/unit/`，Electron 冒烟测试位于 `tests/e2e/`。图标放在 `assets/`，浏览器端第三方运行时代码放在 `public/vendor/`，Live2D 模型资源放在 `material/`。构建产物在 `dist/`，Windows 安装包和便携包在 `release/`。

## 安装与本地运行

首次拉取仓库后，使用 Node.js 和 npm 安装依赖：

```bash
npm install
```

常用开发命令：

- `npm run electron:dev`：编译主进程，启动 Vite，并打开 Electron 开发窗口。
- `npm run dev`：只启动 Vite 渲染端开发服务器，地址为 `127.0.0.1:5180`。
- `npm run build:main`：只编译 Electron 主进程和预加载脚本。
- `npm run build`：完整构建主进程、Web 类型和渲染端资源。

## 测试规范

项目使用 Vitest 运行 Node 环境单元测试，匹配 `tests/unit/**/*.test.ts`。测试文件命名为 `*.test.ts`，按功能放在 `tests/unit/` 下。涉及启动流程、窗口、IPC、打包或渲染端入口的修改，应额外运行 Electron 冒烟测试。

```bash
npm test
npm run test:watch
npm run smoke
```

## 部署与打包

发布 Windows 版本前先确认 `npm test` 和必要的 `npm run smoke` 通过，然后执行：

```bash
npm run package:win
```

该命令会先运行完整构建，再使用 `electron-builder.yml` 生成 NSIS 安装包和 portable 便携版。产物输出到 `release/`。不要提交临时运行数据 `.tmp/`；只有在正式发布或更新分发文件时才提交 `release/` 中的产物。

## 代码风格与命名约定

使用 TypeScript ES modules，本地编译后导入路径保持显式 `.js` 后缀，例如 `src/main/index.ts`。缩进使用两个空格，字符串优先使用双引号，并保留分号。React 组件使用 PascalCase 文件名，如 `App.tsx`、`Live2DCanvas.tsx`；Hook 使用 `useX.ts`；普通模块使用 camelCase。IPC 名称和共享类型应集中维护在 `src/shared/`。

## 提交与 Pull Request 规范

当前 Git 历史只有 `first commit`，尚未形成严格提交规范。建议使用简短祈使句，例如 `Add settings IPC validation`，并将无关修改拆分提交。PR 应说明行为变化、列出已运行的验证命令、关联 issue；涉及桌宠或设置界面视觉变化时，附截图或录屏。

## 安全与配置提示

不要提交密钥、本地缓存或个人配置。`material/` 中的模型路径会被默认配置和测试引用；移动或重命名模型文件时，需要同步更新默认值和相关测试。
