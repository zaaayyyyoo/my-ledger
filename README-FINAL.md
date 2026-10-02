# Daily Ledger 2.2

记账应用使用 Vue 3 + TypeScript + Vite 前端和 Capacitor 6 Android 容器。账单只保存在设备本机的 localStorage，不连接远程 API，也不需要后端或账号。

## 本地开发

```bash
cd frontend
npm install
npm run dev
```

## 构建 Android APK

```bash
npm run build:android
```

GitHub Actions 也会在 main/master 有推送时构建已签名 APK artifact。工作流只负责编译和打包；应用运行时不访问网络服务，账单数据留在本机。

## 数据存储

账单保存在 Android 应用的 WebView 本地存储中。卸载应用或清除应用数据会删除本机账单，卸载应用或清除应用数据会删除保存在设备上的账单。
