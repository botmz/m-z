# Written by blitz.cloud for this project. It is yours now: blitz.cloud
# builds from it as it is, and you can change it like any other file.
########## Build stage ##########
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

COPY . .

RUN pnpm install --no-frozen-lockfile

ENV PORT=8080
ENV BASE_PATH=/

RUN pnpm --filter @workspace/mz-telegram build
RUN pnpm --filter @workspace/api-server build

########## Final stage ##########
FROM node:22-alpine

RUN apk add --no-cache nginx

WORKDIR /app
COPY --from=builder /app /app

RUN mkdir -p /tmp/nginx/client_temp /tmp/nginx/proxy_temp /tmp/nginx/fastcgi_temp /tmp/nginx/uwsgi_temp /tmp/nginx/scgi_temp \
    && chown -R 1000:1000 /tmp/nginx /app

RUN cat > /etc/nginx/nginx.conf <<'EOF'
worker_processes 1;
pid /tmp/nginx/nginx.pid;
error_log /dev/stderr;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    client_body_temp_path /tmp/nginx/client_temp;
    proxy_temp_path /tmp/nginx/proxy_temp;
    fastcgi_temp_path /tmp/nginx/fastcgi_temp;
    uwsgi_temp_path /tmp/nginx/uwsgi_temp;
    scgi_temp_path /tmp/nginx/scgi_temp;

    access_log off;

    server {
        listen 8080;

        root /app/artifacts/mz-telegram/dist/public;
        index index.html;

        location /api/ {
            proxy_pass http://127.0.0.1:3000/api/;
            proxy_set_header Host $host;
        }

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
EOF

ENV PORT=8080
EXPOSE 8080

USER 1000:1000

CMD sh -c "PORT=3000 node --enable-source-maps /app/artifacts/api-server/dist/index.mjs & nginx -g 'daemon off;'"
