# Daily Ledger 2.2

记账应用使用 Vue 3 + TypeScript + Vite 前端、Capacitor 6 Android 容器，以及 Rust + Axum + SQLx + SQLite 后端。

## 架构

```
Vue 3 + TypeScript / Capacitor
       | HTTP JSON API (optional)
       v
Rust Axum API
       |
       v
SQLite
```

没有设置 `VITE_API_BASE_URL` 时，前端使用本机 localStorage 离线运行。设置该变量后，账单写入远程 API。首次连接时，如果服务端账单为空，会尝试把旧版本地账单导入一次。

## 本地开发

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
cargo run
```

后端默认监听 `0.0.0.0:3000`，数据库默认是 `sqlite://ledger.db`。可用 `DATABASE_URL` 和 `BIND_ADDR` 覆盖。

## API

- `GET /api/health`
- `GET /api/bills?q=&start=&end=&page=1&page_size=50`
- `POST /api/bills`
- `PUT /api/bills/:id`
- `DELETE /api/bills/:id`
- `POST /api/bills/import`，请求体为 `{"bills":[...]}`

列表响应为 `{"items":[...],"total":N}`。金额以元作为 API JSON 数字，数据库以整数分存储。

## Android

`npm run build:android` 会构建 Web 前端、同步 Capacitor 并生成 Debug APK。GitHub Actions 会在 push 到 main/master 或手动触发时构建 APK artifact。

若要让 Android 使用远程 API，在构建环境设置 `VITE_API_BASE_URL`，值应是 API 的 HTTPS origin，例如 `https://ledger.example.com`。留空时使用离线模式。

## Docker 后端

```bash
docker compose up -d --build
```

服务健康检查路径为 `/api/health`，SQLite 数据库存储在命名卷 `ledger-data` 中。生产部署请在反向代理配置 HTTPS，并限制 API 网络访问；当前示例 API 未实现账号认证，适合个人或可信网络自托管，不应直接作为多用户公网服务开放。
