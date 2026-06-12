# Production Dockerfile for Mediloop v4.0
FROM node:22-alpine AS builder

WORKDIR /app

# Copy configuration and package details
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies (production + development for building TypeScript)
RUN npm install
RUN cd backend && npm install

# Copy source code
COPY . .

# Generate Prisma Client (uses SQLite for dev / local, can be configured for postgres)
RUN npm run prisma:generate

# Stage 2: Final lightweight image
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

CMD ["npm", "run", "start"]
