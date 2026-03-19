FROM node:20-alpine

WORKDIR /app

# Installer les dépendances en premier (cache Docker)
COPY package*.json ./
RUN npm ci --only=production

# Copier le reste du projet
COPY . .

EXPOSE 3000

CMD ["node", "bot.js"]
