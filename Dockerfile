# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and config files
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json tsconfig.build.json* nest-cli.json ./
COPY src ./src

# Build the application
RUN pnpm run build

# Prune dev dependencies for production
RUN pnpm prune --prod

# ============================================
# Stage 3: Production
# ============================================
FROM node:22-alpine AS production

# Add labels for better maintainability
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
ENV PORT=3000

# Copy production dependencies and built application
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]
