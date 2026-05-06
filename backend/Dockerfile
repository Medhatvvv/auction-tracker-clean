# Use Microsoft's Playwright image — it bundles Chromium + every system lib.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

# /app/data is the mounted volume in production
ENV DATA_DIR=/app/data
ENV PORT=4000
EXPOSE 4000
USER root
CMD ["node", "src/index.js"]
