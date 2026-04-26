# ---- Build Stage ----
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install build deps
RUN apk add --no-cache git

# Copy go mod files first for layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /glow-api ./cmd/server/main.go

# ---- Runtime Stage ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /glow-api .
COPY migrations/ ./migrations/

EXPOSE 8080

CMD ["./glow-api"]
