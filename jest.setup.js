// jest.setup.js - Jest 全局设置

const path = require('path');
const fs = require('fs');

// 设置环境变量 - 使用文件数据库用于测试
process.env.JWT_SECRET = 'test-secret-key';
process.env.ADMIN_PASSWORD = 'admin123';

// 创建测试数据目录
const testDataDir = path.join(__dirname, 'test-data');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

// 每次测试使用新的数据库文件
const testDbPath = path.join(testDataDir, 'test.db');
if (fs.existsSync(testDbPath)) {
  try {
    fs.unlinkSync(testDbPath);
  } catch (e) {
    // 忽略
  }
}
process.env.DB_PATH = testDbPath;
