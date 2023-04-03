# BUILDING
FROM node:16-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

# cache dependencies
COPY package.json ./

# 在国内打开下面一行加速
#RUN npm config set registry https://registry.npm.taobao.org/

# instal dependencies
RUN pnpm i

# build
COPY . ./
RUN pnpm run build

# RUNNING
FROM node:lts-alpine

# use China mirror of: https://github.com/jgm/pandoc/releases/download/2.7.3/pandoc-2.7.3-linux.tar.gz
RUN wget http://rap2-taobao-org.oss-cn-beijing.aliyuncs.com/pandoc-2.7.3-linux.tar.gz && \
    tar -xf pandoc-2.7.3-linux.tar.gz && \
    cp pandoc-2.7.3/bin/* /usr/bin/ && \
    pandoc -v && \
    rm -rf pandoc-2.7.3-linux.tar.gz pandoc-2.7.3

WORKDIR /app
COPY --from=builder /app/public .
COPY --from=builder /app/dist .
COPY --from=builder /app/node_modules ./node_modules
