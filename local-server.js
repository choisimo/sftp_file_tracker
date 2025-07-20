const chokidar = require('chokidar');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
require('dotenv').config();

const logger = require('./src/logger');

class LocalFileMonitor {
  constructor() {
    this.monitorDir = process.env.MONITOR_DIR || './watch';
    this.webhookUrl = process.env.WEBHOOK_URL;
    this.cacheFilePath = process.env.CACHE_FILE_PATH || './data/known_files.json';
    this.maxRetryAttempts = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY_MS) || 5000;
    this.ignoreInitial = process.env.IGNORE_INITIAL_FILES === 'true';

    this.knownFiles = this.loadKnownFiles();
    this.watcher = null;
    this.isRunning = false;

    this.validateConfig();
    this.ensureDirectories();
  }

  validateConfig() {
    if (!process.env.WEBHOOK_URL) {
      const error = 'WEBHOOK_URL environment variable is required';
      logger.error(error);
      throw new Error(error);
    }

    if (!fs.existsSync(this.monitorDir)) {
      logger.info(`Creating monitor directory: ${this.monitorDir}`);
      fs.mkdirSync(this.monitorDir, { recursive: true });
    }
  }

  ensureDirectories() {
    const dataDir = path.dirname(this.cacheFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    }
  }

  loadKnownFiles() {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
        logger.info(`Loaded ${data.length} known files from cache`);
        return new Set(data);
      }
    } catch (error) {
      logger.warn(`Failed to load known files cache: ${error.message}`);
    }
    return new Set();
  }

  saveKnownFiles() {
    try {
      const fileArray = Array.from(this.knownFiles);
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(fileArray, null, 2));
      logger.debug(`Saved ${fileArray.length} known files to cache`);
    } catch (error) {
      logger.error(`Failed to save known files cache: ${error.message}`);
    }
  }

  async sendWebhook(fileInfo, retryCount = 0) {
    try {
      const payload = {
        filename: path.basename(fileInfo.path),
        size: fileInfo.size,
        modifyTime: fileInfo.mtime,
        path: fileInfo.path,
        absolutePath: path.resolve(fileInfo.path),
        detectedAt: moment().toISOString(),
        type: 'file',
        event: fileInfo.event || 'add'
      };

      const response = await axios.post(this.webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Local-File-Monitor/1.0.0'
        }
      });

      logger.info(`Webhook sent successfully for file: ${payload.filename}`, {
        statusCode: response.status,
        filename: payload.filename,
        event: payload.event
      });

      return response;
    } catch (error) {
      logger.warn(`Webhook failed (attempt ${retryCount + 1}) for file ${path.basename(fileInfo.path)}: ${error.message}`);
      
      if (retryCount < this.maxRetryAttempts - 1) {
        await this.delay(this.retryDelay);
        return this.sendWebhook(fileInfo, retryCount + 1);
      }
      
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  createFileKey(filePath, stats) {
    return `${filePath}:${stats.size}:${stats.mtime.getTime()}`;
  }

  async getFileInfo(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        isFile: stats.isFile()
      };
    } catch (error) {
      logger.warn(`Failed to get file info for ${filePath}: ${error.message}`);
      return null;
    }
  }

  async handleFileEvent(eventType, filePath) {
    try {
      logger.debug(`File ${eventType}: ${filePath}`);

      if (eventType === 'unlink') {
        // 파일 삭제 시 캐시에서 제거
        const keysToRemove = Array.from(this.knownFiles).filter(key => key.startsWith(filePath + ':'));
        keysToRemove.forEach(key => this.knownFiles.delete(key));
        
        if (keysToRemove.length > 0) {
          this.saveKnownFiles();
          logger.info(`Removed deleted file from cache: ${path.basename(filePath)}`);
        }
        return;
      }

      const fileInfo = await this.getFileInfo(filePath);
      if (!fileInfo || !fileInfo.isFile) {
        return;
      }

      const fileKey = this.createFileKey(filePath, {
        size: fileInfo.size,
        mtime: new Date(fileInfo.mtime)
      });

      if (!this.knownFiles.has(fileKey)) {
        this.knownFiles.add(fileKey);
        
        // 이전 버전의 파일 키 제거 (같은 경로의 다른 크기/시간)
        const oldKeys = Array.from(this.knownFiles).filter(key => 
          key.startsWith(filePath + ':') && key !== fileKey
        );
        oldKeys.forEach(key => this.knownFiles.delete(key));

        fileInfo.event = eventType;
        
        try {
          await this.sendWebhook(fileInfo);
          logger.info(`New file processed: ${path.basename(filePath)} (${fileInfo.size} bytes)`);
        } catch (error) {
          // 웹훅 전송 실패 시 캐시에서 제거하여 재시도 가능하게 함
          this.knownFiles.delete(fileKey);
          logger.error(`Failed to send webhook for file ${path.basename(filePath)}: ${error.message}`);
        }

        this.saveKnownFiles();
      } else {
        logger.debug(`File already known: ${path.basename(filePath)}`);
      }

    } catch (error) {
      logger.error(`Error handling file event ${eventType} for ${filePath}: ${error.message}`);
    }
  }

  start() {
    if (this.isRunning) {
      logger.warn('Monitor is already running');
      return;
    }

    logger.info('Starting local file monitor', {
      monitorDir: path.resolve(this.monitorDir),
      webhookUrl: this.webhookUrl,
      ignoreInitial: this.ignoreInitial
    });

    try {
      this.watcher = chokidar.watch(this.monitorDir, {
        ignored: [
          /(^|[\/\\])\../, // 숨김 파일
          /node_modules/,
          /\.log$/,
          /\.tmp$/,
          /~$/
        ],
        ignoreInitial: this.ignoreInitial,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      });

      this.watcher
        .on('add', (filePath) => this.handleFileEvent('add', filePath))
        .on('change', (filePath) => this.handleFileEvent('change', filePath))
        .on('unlink', (filePath) => this.handleFileEvent('unlink', filePath))
        .on('error', (error) => logger.error(`Watcher error: ${error.message}`))
        .on('ready', () => {
          this.isRunning = true;
          logger.info('File watcher is ready and monitoring for changes');
        });

    } catch (error) {
      logger.error(`Failed to start file monitor: ${error.message}`);
      throw error;
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close().then(() => {
        logger.info('File monitor stopped');
        this.isRunning = false;
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      knownFilesCount: this.knownFiles.size,
      monitorDir: path.resolve(this.monitorDir),
      config: {
        monitorDir: this.monitorDir,
        webhookUrl: this.webhookUrl,
        ignoreInitial: this.ignoreInitial
      }
    };
  }

  async scanExisting() {
    logger.info('Scanning existing files...');
    
    const walkDir = (dir) => {
      let files = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        
        if (stats.isFile()) {
          files.push(fullPath);
        } else if (stats.isDirectory() && !item.startsWith('.')) {
          files = files.concat(walkDir(fullPath));
        }
      }
      
      return files;
    };

    try {
      const files = walkDir(this.monitorDir);
      
      for (const filePath of files) {
        const fileInfo = await this.getFileInfo(filePath);
        if (fileInfo && fileInfo.isFile) {
          const fileKey = this.createFileKey(filePath, {
            size: fileInfo.size,
            mtime: new Date(fileInfo.mtime)
          });
          this.knownFiles.add(fileKey);
        }
      }
      
      this.saveKnownFiles();
      logger.info(`Scanned ${files.length} existing files`);
    } catch (error) {
      logger.error(`Failed to scan existing files: ${error.message}`);
    }
  }
}

const monitor = new LocalFileMonitor();

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  monitor.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  monitor.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  monitor.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

if (require.main === module) {
  // 기존 파일 스캔 여부
  if (process.env.SCAN_EXISTING === 'true') {
    monitor.scanExisting().then(() => {
      monitor.start();
    });
  } else {
    monitor.start();
  }
}

module.exports = LocalFileMonitor;