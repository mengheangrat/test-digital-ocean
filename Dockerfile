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

# Create uploads directory
RUN mkdir -p /root/tmp/uploads

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Run as root to access /root/tmp/uploads
# Start the application
CMD ["npm", "start"]
