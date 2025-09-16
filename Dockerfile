# Use Node.js 18+ which supports static block syntax
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create uploads directory with proper permissions
RUN mkdir -p /root/tmp/uploads

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory (including uploads)
RUN chown -R nodejs:nodejs /app
USER nodejs

# Start the application
CMD ["npm", "start"]
