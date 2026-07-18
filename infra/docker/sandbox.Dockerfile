# Sandbox image: everything a per-project container needs to run `codex exec`
# against a copy of the app template. Refined at M1 (e.g. pre-baked template
# node_modules for faster cold starts).
FROM node:22-bookworm

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9 --activate

# Codex CLI — the runtime build agent (always Codex, never substituted).
RUN npm install -g @openai/codex

# Playwright chromium + OS deps for the template's screenshot quality loop.
# MUST match the exact playwright version pinned in templates/app-template/package.json
# (browser builds are per-version; a mismatch breaks screenshots in the container).
RUN npx -y playwright@1.61.1 install --with-deps chromium

WORKDIR /workspace
