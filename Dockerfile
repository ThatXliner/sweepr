FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY
RUN SWEEPR_ADAPTER=node npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/tactical').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
