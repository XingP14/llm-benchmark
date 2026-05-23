FROM node:20-alpine

# 安装 Python (用于沙盒执行)
RUN apk add --no-cache python3

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制构建文件
COPY dist ./dist
COPY public ./public
COPY database ./database

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/web/server.js"]
