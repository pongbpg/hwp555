FROM node:20-alpine as build

WORKDIR /app

# Build-time env var for Vite
ARG VITE_HR_API_BASE_URL=http://localhost:5000/api
ENV VITE_HR_API_BASE_URL=$VITE_HR_API_BASE_URL

ARG VITE_STOCK_API_BASE_URL=http://localhost:5001/api
ENV VITE_STOCK_API_BASE_URL=$VITE_STOCK_API_BASE_URL

ARG VITE_SALE_API_BASE_URL=http://localhost:5002/api
ENV VITE_SALE_API_BASE_URL=$VITE_SALE_API_BASE_URL

ARG VITE_SOCKET_URL=http://localhost:5002
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist ./dist

EXPOSE 5002

CMD ["serve", "-s", "dist", "-l", "5002"]
