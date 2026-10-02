# Daily Ledger 2.2

记账应用使用 Vue 3 + TypeScript + Vite 前端和 Capacitor 6 Android 容器。账单只保存在设备本机的 localStorage，不连接远程 API，也不需要后端或账号。

## 本地开发

```bash
cd frontend
npm install
npm run dev
```

## 构建 Android APK

在仓库根目录运行：

```bash
npm install
npm run build:android
```

GitHub Actions 负责自动构建并提供已签名 APK artifact。它只用于打包；应用运行时不访问远程服务，账单数据留在本机。

## 数据存储

卸载应用或清除应用数据会删除保存在设备上的账单。
