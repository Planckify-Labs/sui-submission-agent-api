# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps

# Install pnpm — pin major to match lockfileVersion '9.0' (pnpm 10.x)
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM node:22-alpine AS builder

# Install pnpm — pin major to match lockfileVersion '9.0' (pnpm 10.x)
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy package files, config, and source
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json tsconfig.build.json* nest-cli.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src

# Create dummy .env for Prisma (excluded by .dockerignore)
RUN touch .env

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
# Use build:image (not build) — the plain `build` runs the host-only
# manifests:sync, which writes to a sibling ../../mobile-app mirror that
# does not exist inside the image and exits 1. nest build still copies
# the runtime manifest into dist/src via nest-cli.json assets.
RUN pnpm run build:image

# Prune dev dependencies for production
RUN pnpm prune --prod

# ============================================
# Stage 3: Production
# ============================================
FROM node:22-alpine AS production

# Add labels
LABEL org.opencontainers.image.title="Takumi Agent API"
LABEL org.opencontainers.image.description="NestJS AI Agent API with MCP integration"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy production dependencies and built application
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/generated ./generated
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/prisma.config.ts ./

# Copy and setup entrypoint script
COPY --chown=nestjs:nodejs scripts/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 7200

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 7200) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application (runs prisma db push then node)
CMD ["./docker-entrypoint.sh"]
