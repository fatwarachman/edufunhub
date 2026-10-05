FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/chat ./cmd/chat

FROM alpine:3.20
RUN adduser -D -H -u 10001 chat && apk add --no-cache wget
USER chat
COPY --from=build /out/chat /usr/local/bin/chat
EXPOSE 8091
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8091/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/chat"]
