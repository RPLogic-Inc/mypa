FROM node:20-alpine AS builder
WORKDIR /app

# Accept build args for Vite environment variables
ARG VITE_BASE_DOMAIN=localhost
ARG VITE_INSTANCE_MODE=team
ARG VITE_RELAY_URL
ARG VITE_BACKEND_URL

# Set as env vars so Vite can inline them at build time
ENV VITE_BASE_DOMAIN=$VITE_BASE_DOMAIN
ENV VITE_INSTANCE_MODE=$VITE_INSTANCE_MODE
ENV VITE_RELAY_URL=$VITE_RELAY_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
