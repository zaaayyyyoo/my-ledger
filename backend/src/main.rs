use axum::{extract::{Path, Query, State}, http::StatusCode, routing::{delete, get, post, put}, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, QueryBuilder, Sqlite, SqlitePool};
use std::{env, str::FromStr};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState { pool: SqlitePool }

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Bill {
    id: Option<i64>,
    #[serde(rename = "type")]
    kind: String,
    title: String,
    amount: f64,
    date: String,
}
#[derive(Serialize)]
struct BillRow {
    id: i64,
    #[serde(rename = "type")]
    kind: String,
    title: String,
    amount: f64,
    date: String,
}
#[derive(Deserialize)]
struct ListQuery {
    q: Option<String>, start: Option<String>, end: Option<String>,
    page: Option<i64>, page_size: Option<i64>,
}
#[derive(Serialize)]
struct BillPage { items: Vec<BillRow>, total: i64 }
#[derive(Deserialize)]
struct ImportBody { bills: Vec<Bill> }

fn validate(b: &Bill) -> Result<i64, &'static str> {
    if b.kind != "income" && b.kind != "expense" { return Err("type must be income or expense"); }
    if b.title.trim().is_empty() || b.title.len() > 200 { return Err("title must be 1-200 bytes"); }
    if !b.amount.is_finite() || b.amount <= 0.0 { return Err("amount must be positive"); }
    if b.date.len() != 10 { return Err("date must use YYYY-MM-DD"); }
    Ok((b.amount * 100.0).round() as i64)
}
async fn health() -> &'static str { "ok" }

async fn list(State(s): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<BillPage>, StatusCode> {
    let page = q.page.unwrap_or(1).max(1);
    let size = q.page_size.unwrap_or(50).clamp(1, 200);
    let mut count = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM bills WHERE 1=1");
    let mut rows = QueryBuilder::<Sqlite>::new("SELECT id, kind, title, amount_cents, date FROM bills WHERE 1=1");
    if let Some(term) = q.q.as_ref().filter(|x| !x.trim().is_empty()) {
        let pattern = format!("%{}%", term.trim());
        count.push(" AND title LIKE ").push_bind(pattern.clone());
        rows.push(" AND title LIKE ").push_bind(pattern);
    }
    if let Some(start) = q.start.as_ref().filter(|x| !x.is_empty()) {
        count.push(" AND date >= ").push_bind(start.clone());
        rows.push(" AND date >= ").push_bind(start.clone());
    }
    if let Some(end) = q.end.as_ref().filter(|x| !x.is_empty()) {
        count.push(" AND date <= ").push_bind(end.clone());
        rows.push(" AND date <= ").push_bind(end.clone());
    }
    let total: i64 = count.build_query_scalar().fetch_one(&s.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    rows.push(" ORDER BY date DESC, id DESC LIMIT ").push_bind(size)
        .push(" OFFSET ").push_bind((page-1)*size);
    let raw = rows.build().fetch_all(&s.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    use sqlx::Row;
    let items = raw.into_iter().map(|r| BillRow {
        id:r.get("id"), kind:r.get("kind"), title:r.get("title"),
        amount:r.get::<i64,_>("amount_cents") as f64 / 100.0, date:r.get("date")
    }).collect();
    Ok(Json(BillPage { items, total }))
}
async fn create(State(s): State<AppState>, Json(b): Json<Bill>) -> Result<(StatusCode, Json<BillRow>), StatusCode> {
    let cents = validate(&b).map_err(|_| StatusCode::BAD_REQUEST)?;
    let result = if let Some(id)=b.id {
        sqlx::query("INSERT INTO bills(id,kind,title,amount_cents,date) VALUES(?,?,?,?,?)")
            .bind(id).bind(&b.kind).bind(b.title.trim()).bind(cents).bind(&b.date).execute(&s.pool).await
    } else {
        sqlx::query("INSERT INTO bills(kind,title,amount_cents,date) VALUES(?,?,?,?)")
            .bind(&b.kind).bind(b.title.trim()).bind(cents).bind(&b.date).execute(&s.pool).await
    }.map_err(|_| StatusCode::CONFLICT)?;
    let id = b.id.unwrap_or(result.last_insert_rowid());
    Ok((StatusCode::CREATED, Json(BillRow { id, kind:b.kind, title:b.title.trim().to_string(), amount:cents as f64/100.0, date:b.date })))
}
async fn update(State(s): State<AppState>, Path(id): Path<i64>, Json(b): Json<Bill>) -> Result<StatusCode, StatusCode> {
    let cents = validate(&b).map_err(|_| StatusCode::BAD_REQUEST)?;
    let r=sqlx::query("UPDATE bills SET kind=?,title=?,amount_cents=?,date=? WHERE id=?")
        .bind(&b.kind).bind(b.title.trim()).bind(cents).bind(&b.date).bind(id).execute(&s.pool).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?;
    if r.rows_affected()==0 { Err(StatusCode::NOT_FOUND) } else { Ok(StatusCode::NO_CONTENT) }
}
async fn remove(State(s): State<AppState>, Path(id): Path<i64>) -> Result<StatusCode, StatusCode> {
    let r=sqlx::query("DELETE FROM bills WHERE id=?").bind(id).execute(&s.pool).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?;
    if r.rows_affected()==0 { Err(StatusCode::NOT_FOUND) } else { Ok(StatusCode::NO_CONTENT) }
}
async fn import(State(s): State<AppState>, Json(body): Json<ImportBody>) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut tx=s.pool.begin().await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?;
    for b in body.bills {
        let cents=validate(&b).map_err(|_|StatusCode::BAD_REQUEST)?;
        if let Some(id)=b.id {
            sqlx::query("INSERT OR IGNORE INTO bills(id,kind,title,amount_cents,date) VALUES(?,?,?,?,?)")
                .bind(id).bind(&b.kind).bind(b.title.trim()).bind(cents).bind(&b.date).execute(&mut *tx).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?;
        } else {
            sqlx::query("INSERT INTO bills(kind,title,amount_cents,date) VALUES(?,?,?,?)")
                .bind(&b.kind).bind(b.title.trim()).bind(cents).bind(&b.date).execute(&mut *tx).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?;
        }
    }
    tx.commit().await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!({"ok":true})))
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_url=env::var("DATABASE_URL").unwrap_or_else(|_|"sqlite://ledger.db".into());
    let options=SqliteConnectOptions::from_str(&db_url)?.create_if_missing(true);
    let pool=SqlitePoolOptions::new().max_connections(5).connect_with(options).await?;
    sqlx::query("CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, amount_cents INTEGER NOT NULL, date TEXT NOT NULL)")
        .execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date DESC)")
        .execute(&pool).await?;
    let app=Router::new().route("/api/health",get(health))
        .route("/api/bills",get(list).post(create))
        .route("/api/bills/:id",put(update).delete(remove))
        .route("/api/bills/import",post(import))
        .layer(CorsLayer::permissive()).layer(TraceLayer::new_for_http())
        .with_state(AppState{pool});
    let addr=env::var("BIND_ADDR").unwrap_or_else(|_|"0.0.0.0:3000".into());
    let listener=tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener,app).await?;
    Ok(())
}
