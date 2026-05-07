FROM node:20-alpine AS build
WORKDIR /app
# Copy scripts/ alongside package.json so the npm postinstall hook
# (scripts/setup-tesseract.mjs, which seeds public/tesseract/ with the
# Tesseract worker + WASM cores + English language data) can run inside
# the npm ci step. The later "COPY . ." overwrites these with identical
# contents — Docker's layer cache makes that effectively free.
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
