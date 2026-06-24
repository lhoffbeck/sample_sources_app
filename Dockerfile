# Node 22: corepack pulls the pinned pnpm (see package.json packageManager),
# which requires Node >= 22.13. package.json engines also allows >=22.12.
FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

# This template uses pnpm. Enable it via corepack (bundled with Node).
RUN corepack enable

# Copy the whole repo (node_modules/build are excluded via .dockerignore) BEFORE
# installing, so .npmrc is guaranteed present — pnpm needs its shamefully-hoist
# setting at install time or vite's config loader can't resolve 'vite'.
COPY . .

# Install all deps (incl. dev) — the build step needs vite/react-router tooling.
RUN pnpm install --frozen-lockfile

# Fail loudly with a clear message if hoisting didn't place vite where the
# react-router/vite build expects it (rather than a cryptic ESM resolve error).
RUN node -e "require.resolve('vite/package.json')" \
  || (echo 'ERROR: vite not resolvable after install — check .npmrc shamefully-hoist' && exit 1)

RUN pnpm run build

# Production only matters at runtime; building runs in dev mode so devDeps are used.
ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "run", "docker-start"]
