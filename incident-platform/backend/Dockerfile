FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY app ./app

EXPOSE 8000

CMD ["npm", "run", "start"]
