# Build frontend
FROM node:20-alpine AS client
WORKDIR /app/client

# Needed for some node modules
RUN apk add --no-cache python3 make g++

ENV NODE_ENV=development
COPY client/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY client/ .
RUN npm install @tabler/core
RUN npm run build

# Server
FROM node:20-alpine
WORKDIR /app

COPY server/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY server/ .
COPY --from=client /app/client/dist /app/client-dist

RUN apk add --no-cache bash tar mysql-client docker-cli
RUN npm install archiver bcrypt jsonwebtoken express-validator cookie-parser mysql2
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]