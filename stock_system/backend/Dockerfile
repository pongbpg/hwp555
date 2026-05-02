FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev for nodemon)
RUN npm install

# Copy app source
COPY . .

# Expose port
EXPOSE 3002

# Start app
CMD ["node", "server.js"]
