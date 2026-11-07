# Unmodified OpenAI Codex CLI for Staplr's login sandbox. The CLI is installed from
# npm at a pinned version and its authentication is not altered.
# Version 0.167.0 was the npm "latest" on 2026-11-08 (published 2026-11-06).
FROM node:22-alpine
ARG CODEX_VERSION=0.167.0
RUN npm install -g "@openai/codex@${CODEX_VERSION}" && npm cache clean --force
# Staplr passes -c cli_auth_credentials_store="file" on every codex command so the login is
# the file ~/.codex/auth.json. HOME is a tmpfs at run time, so nothing is written to the image.
ENV HOME=/home/agent CODEX_HOME=/home/agent/.codex
WORKDIR /home/agent
CMD ["sleep", "infinity"]
