# Node 22: corepack pulls the latest pnpm (v11+), which requires Node >= 22.13
# (it imports the node:sqlite builtin). package.json engines also allows >=22.12.
FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

# This template uses pnpm. Enable it via corepack (bundled with Node).
RUN corepack enable

# Include .npmrc so install honors shamefully-hoist (vite/react-router config
# loaders resolve their deps from a flat node_modules) and auto-install-peers.
COPY package.json pnpm-lock.yaml .npmrc ./

# Install all deps (incl. dev) — the build step needs vite/react-router tooling.
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

CMD ["pnpm", "run", "docker-start"]
