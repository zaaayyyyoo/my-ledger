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

- `daily-ledger-migration-apk`：应用 ID 是 `com.wonder.ledger`，用于覆盖更新旧应用，并安全提供本机迁移数据。
- `daily-ledger-local-apk`：应用 ID 是 `com.wonder.ledger.local`，作为独立新应用与旧应用并存。

## 自动迁移旧版账单

1. 在 GitHub Actions 的构建结果中下载 `daily-ledger-migration-apk`，安装以更新原来的旧应用。不要先卸载旧应用。
2. 打开迁移版一次。它会把旧应用本地账单存入应用私有迁移文件，并通过仅允许相同发布签名访问的 Android 接口提供给新版。
3. 安装 `daily-ledger-local-apk` 并打开。新版会自动读取迁移数据、写入自己的本机账本和备份；无需手动导出或选择 JSON 文件。

旧、新应用使用不同应用 ID，Android 默认隔离各自私有数据；旧应用不能被新版直接读取。迁移 APK 必须先作为旧应用的更新安装，才能在旧应用内部读取其原有账单。更新还要求新旧 APK 使用相同签名；如果 Android 提示签名不一致，不要卸载旧应用，这表示当前密钥无法更新该旧 APK。迁移只包含旧版本机保存的账单，线上服务中的数据不会被下载。

## 本机账单与卸载备份

每笔账单保存在应用本机，并尝试同步到设备 Documents 文件夹。卸载应用会清除应用私有数据；迁移完成后，新版自己的本机备份文件可供后续恢复。文件访问受 Android 版本和设备文件管理器权限限制时，仍可在应用中选择 JSON 备份恢复。
