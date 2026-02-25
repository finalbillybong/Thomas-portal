FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

COPY package.json ./
RUN npm install

COPY scrape-homework.mjs ./

CMD ["node", "scrape-homework.mjs"]
