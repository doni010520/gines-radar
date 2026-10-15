FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# variáveis públicas precisam existir em build-time (ficam embutidas no bundle do client)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# o radar baixa os portais via curl (a Cloudflare do ZAP bloqueia a assinatura TLS do Node)
# OLX e Mercado Livre só abrem num navegador de verdade e "visível" (headless toma 403):
# Chromium + tela virtual (Xvfb). playwright-core só controla o Chromium do sistema.
RUN apk add --no-cache curl chromium xvfb-run font-noto
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# a tela virtual existe enquanto o servidor roda; o navegador só abre durante uma busca
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1366x900x24", "node", "server.js"]
