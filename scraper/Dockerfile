FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json ./
RUN npm install

COPY scrape-homework.mjs ./

CMD ["node", "scrape-homework.mjs"]
