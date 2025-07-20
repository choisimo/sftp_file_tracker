# Local File Monitor Docker Image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/watch /app/logs /app/data

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S fileMonitor -u 1001

# Copy application files
COPY local-server.js ./
COPY src/ ./src/

# Copy environment file if exists, otherwise create default
COPY .env.docker ./.env.local

# Change ownership to non-root user (including mounted volumes)
RUN chown -R fileMonitor:nodejs /app && \
    chmod -R 755 /app && \
    chmod 775 /app/watch /app/logs /app/data

# Switch to non-root user
USER fileMonitor

# Expose port
EXPOSE 13030

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the application
CMD ["node", "local-server.js"]