# Daily Ledger 本地版

记账应用使用 Vue 3 + TypeScript + Vite 和 Capacitor Android。账单只在本机处理，不连接远程 API 或后端。

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

GitHub Actions 只负责构建和签名 APK，不参与应用运行时的数据读写。

## 本机账单与卸载备份

账单首先保存在应用本机。安装版会自动把副本写入公共 Documents 文件夹的 `DailyLedger/ledger-backup.json`，重装后会尝试自动恢复。应用中也可手动备份或从 JSON 文件恢复。

卸载应用会清除应用私有数据；请确认 Documents 里的备份文件已成功更新。Android 系统的文件权限或设备文件管理器限制可能需要手动选择 JSON 文件恢复。

## 新旧版本并存

本地版使用新的 Android 应用 ID `com.wonder.ledger.local`，可以和原来的 `com.wonder.ledger` 同时安装。旧版账单仍保存在旧应用中，不会自动出现在新应用；可通过 JSON 备份文件导入。
