FROM rust:1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libsqlite3-0 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/daily-ledger-api /usr/local/bin/daily-ledger-api
ENV DATABASE_URL=sqlite:///data/ledger.db
ENV BIND_ADDR=0.0.0.0:3000
EXPOSE 3000
CMD ["daily-ledger-api"]
