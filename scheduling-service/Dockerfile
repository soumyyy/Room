FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 ROOM_SCHEDULER_DB=/data/schedules.sqlite
EXPOSE 8080
CMD ["node", "src/server.mjs"]
