# Daily Ledger 2.0

前端 Vue 3 + TypeScript + Vite，后端 Rust + Axum + SQLx + SQLite，Android 使用 Capacitor 6。

## 架构

```text
Vue 3 / Capacitor
       |
       | HTTP JSON API
       v
Rust Axum
       |
       v
SQLite
```

前端未配置 `VITE_API_BASE_URL` 时自动使用本地存储，保证 APK 可以离线使用；配置后自动使用 Rust 后端，并在首次连接且后端为空时把旧本地账单迁移到 SQLite。

## 本地运行

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 后端

```bash
cd backend
cargo run
```

默认 `0.0.0.0:3000`，数据库默认 `sqlite://ledger.db`。

## 后端 API

- `GET /api/health`
- `GET /api/bills?q=&range=&start=&end=&page=1&page_size=50`
- `POST /api/bills`
- `PUT /api/bills/:id`
- `DELETE /api/bills/:id`
- `POST /api/bills/import`

## Android Action

GitHub Actions 会自动安装前端、构建 `frontend/dist`、同步 Capacitor，并生成 Debug APK artifact。

如果希望 APK 连接远程 Rust 后端，在 GitHub Settings → Secrets and variables → Actions → Variables 增加：

`VITE_API_BASE_URL=https://你的后端地址`

不设置时 APK 默认使用本地离线模式。

## 数据性能

列表默认分页 50 条，SQLite 对日期、类型+日期建立索引，统计在数据库侧聚合，不再把全部账单一次性加载进前端 DOM。

## Docker 部署后端

```bash
docker compose up -d --build
```

健康检查：`http://服务器地址:3000/api/health`

## 重要说明

Android APK 本身不运行 Rust 服务进程；Rust 后端是独立服务。APK 可以在未配置 API 时完全离线运行，也可以通过 `VITE_API_BASE_URL` 连接部署好的 Rust 服务。若在公网使用，建议使用 HTTPS 反向代理，不要直接暴露 SQLite 服务。
