FROM node:22-alpine
WORKDIR /test
COPY . /test
CMD ["node","check.mjs"]
