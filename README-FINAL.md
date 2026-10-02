# Daily Ledger 本地版

记账应用使用 Vue 3 + TypeScript + Vite 和 Capacitor Android。账单在设备本机保存，不连接远程 API 或后端。

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

GitHub Actions 每次构建会生成两个签名 APK artifact：

- `daily-ledger-migration-apk`：应用 ID 为 `com.wonder.ledger`，用于在旧应用上覆盖安装并导出其本地账单。
- `daily-ledger-local-apk`：应用 ID 为 `com.wonder.ledger.local`，作为独立的新应用安装，可与旧应用并存。

## 把旧版账单迁入独立新版

请按顺序操作，迁移期间不要先卸载旧应用：

1. 在 GitHub Actions 的构建结果中下载 `daily-ledger-migration-apk`。
2. 直接安装它以更新原来的 `com.wonder.ledger` 应用。若 Android 提示签名不一致而拒绝更新，说明旧 APK 与当前发布密钥不同；请保留旧应用，使用旧应用内的 JSON 备份功能导出后再继续。
3. 打开更新后的迁移版一次。它会保留旧应用私有区中的 `daily_expenses_records` 账单，并自动写入 `Documents/DailyLedger/ledger-backup-legacy.json`。
4. 下载并安装 `daily-ledger-local-apk`。它会以独立应用运行，原旧应用仍可保留。
5. 在新版点“从文件恢复”，在系统文件选择器中选取 `ledger-backup-legacy.json`。确认后，新版账单会保存到自己的本机存储，并写入自己的备份文件 `Documents/DailyLedger/ledger-backup-local.json`。

旧应用和新应用使用不同应用 ID，Android 将它们的私有数据隔离。迁移版可以读取旧应用更新后保留下来的本地账单并自动导出；独立新版不能直接读取旧应用私有数据，因此第一次跨应用导入需要在系统文件选择器中选择一次文件。若跳过迁移版、先卸载旧应用，Android 会删除旧应用私有数据。此流程迁移旧版本地保存的账单；只存在线上服务中的数据不会被下载。

## 本机账单与卸载备份

每笔账单保存在应用本机，并尝试同步到设备 Documents 文件夹。卸载应用会清除应用私有数据，Documents 文件中的备份可供后续恢复。文件访问受 Android 版本和设备文件管理器权限限制时，可通过应用里的“从文件恢复”手动选择 JSON 文件。
