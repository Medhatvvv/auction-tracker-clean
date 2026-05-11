# Use Microsoft's Playwright image — it bundles Chromium + every system lib.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

# Install build tools + python — required for compiling native npm modules
# like better-sqlite3 when no prebuilt binary is available.
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

# /app/data is the mounted volume in production
ENV DATA_DIR=/app/data
ENV PORT=4000
EXPOSE 4000

# Run as root so the mounted volume at /app/data is writable
USER root

CMD ["node", "src/index.js"]
