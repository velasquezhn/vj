FROM node:22-trixie-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-trixie-slim
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && useradd --create-home --uid 10001 appuser
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data /app/logs /app/backups /app/public/comprobantes && chown -R appuser:appuser /app
USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "pnpm db:migrate && node index.js"]
