# Dockerfile para API Bun + MongoDB
# Bun >= 1.2 é obrigatório: uploads usam o S3Client nativo (src/config/s3.ts)
FROM oven/bun:1.3-alpine AS base

# Diretório de trabalho
WORKDIR /app

# Copia arquivos de dependências
COPY package.json bun.lockb* ./

# Instala dependências
RUN bun install --frozen-lockfile

# Copia o código fonte
COPY src ./src
COPY tsconfig.json ./

# Expõe a porta da aplicação
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1))" || exit 1

# Comando para iniciar a aplicação
CMD ["bun", "run", "src/index.ts"]
