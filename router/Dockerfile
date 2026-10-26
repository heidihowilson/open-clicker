# Open Clicker router: KiCad 7 + Freerouting + Bun. Build from the repository root:
#   docker build -f router/Dockerfile .
FROM ubuntu:24.04

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends kicad python3 ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Freerouting with its bundled Java runtime. The checksum is GitHub's published asset digest.
ARG FREEROUTING=2.5.0
ARG FREEROUTING_SHA256=e8ffca14914e5307a2fa9aea723fb93d11b99bebda20d126472da5460c03196e
RUN curl -fsSL -o /tmp/fr.zip "https://github.com/freerouting/freerouting/releases/download/v${FREEROUTING}/freerouting-${FREEROUTING}-linux-x64.zip" \
 && echo "${FREEROUTING_SHA256}  /tmp/fr.zip" | sha256sum -c - \
 && unzip -q /tmp/fr.zip -d /opt \
 && mv "/opt/freerouting-${FREEROUTING}-linux-x64" /opt/freerouting \
 && rm /tmp/fr.zip

COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY designer/package.json designer/bun.lock designer/
RUN cd designer && bun install --frozen-lockfile --production
COPY designer/src designer/src
COPY designer/tsconfig.json designer/
COPY router router

RUN useradd --system --home /tmp router
USER router
ENV PORT=8790 HOME=/tmp FREEROUTING=/opt/freerouting/bin/freerouting
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://127.0.0.1:8790/health || exit 1
CMD ["bun", "router/server.ts"]
