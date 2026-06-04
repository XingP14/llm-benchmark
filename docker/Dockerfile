FROM node:20-alpine

# 安装构建工具和 Python
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源码
COPY src ./src
COPY tsconfig.json ./

# 复制静态资源
COPY public ./public

# 构建
RUN npm run build

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 3033

CMD ["node", "dist/web/server.js"]
