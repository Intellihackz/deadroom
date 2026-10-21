# Builds the website and runs the server that serves it. One image, one service.
# Railway passes the service variables below as build arguments, because they are read when the site is built.

FROM node:22-slim AS build
WORKDIR /app

# dependencies first, so they are cached until a package file changes
COPY web/package.json web/package-lock.json web/
RUN npm --prefix web ci --include=dev
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci

# build-time settings for the website (all optional)
ARG VITE_SITE_URL=""
ARG VITE_TOKEN_CA=""
ARG VITE_TOKEN_SYMBOL=""
ARG VITE_PREVIEW=""
ENV VITE_SITE_URL=$VITE_SITE_URL VITE_TOKEN_CA=$VITE_TOKEN_CA VITE_TOKEN_SYMBOL=$VITE_TOKEN_SYMBOL VITE_PREVIEW=$VITE_PREVIEW

COPY web web
COPY server server
RUN npm --prefix web run build


FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/server server
COPY --from=build /app/web/dist web/dist
# the server finds the website at ../web/dist, relative to where it runs
WORKDIR /app/server
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
