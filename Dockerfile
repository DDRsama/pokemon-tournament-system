FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=18765
ENV DATA_ROOT=/data
ENV DATA_DIR=/data/tournaments
ENV PLAYERS_DIR=/data/players
ENV LEAGUES_DIR=/data/leagues
ENV POINTS_DIR=/data/points
ENV FONTS_DIR=/data/fonts
ENV REPORTS_DIR=/data/reports
ENV PYTHON_BIN=/usr/local/bin/python

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-reportlab fonts-noto-cjk \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /data/tournaments /data/players /data/leagues /data/points /data/fonts /data/reports

EXPOSE 18765

CMD ["node", "src/server.js"]
