# @actual-app/api must match the running actual-server version exactly or
# downloadBudget fails with out-of-sync-migrations. Pass the server version as
# a build arg (the build pipeline derives it from the compose tag) to pin the
# client in lockstep. Empty arg falls back to the package.json pin. An arg that
# isn't on npm fails the build loudly rather than shipping a mismatched client.
ARG ACTUAL_API_VERSION=""

FROM node:22-slim AS builder
WORKDIR /app
ARG ACTUAL_API_VERSION
COPY package.json package-lock.json ./
RUN npm ci
RUN if [ -n "$ACTUAL_API_VERSION" ]; then npm install --no-save @actual-app/api@"$ACTUAL_API_VERSION"; fi
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
WORKDIR /app
ARG ACTUAL_API_VERSION
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
RUN if [ -n "$ACTUAL_API_VERSION" ]; then npm install --no-save @actual-app/api@"$ACTUAL_API_VERSION"; fi
COPY --from=builder /app/dist/ ./dist/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', r => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"
CMD ["node", "dist/index.js"]
