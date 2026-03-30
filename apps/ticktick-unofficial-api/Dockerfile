FROM oven/bun:1.3.6 AS build

WORKDIR /workspace

COPY package.json ./package.json
COPY packages ./packages
COPY apps ./apps

RUN bun install
RUN bun run --cwd packages/node-ticktick-unofficial build

WORKDIR /workspace/apps/ticktick-unofficial-api
RUN bun run build

EXPOSE 3000
ENV NODE_ENV=production
ENV APP_RUNTIME=bun

CMD ["bun", "run", "dist/bun/index.js"]
