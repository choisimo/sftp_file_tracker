const SftpClient = require('ssh2-sftp-client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const logger = require('./src/logger');

class SftpFileMonitor {
  constructor() {
    this.sftpConfig = {
      host: process.env.SFTP_HOST,
      port: parseInt(process.env.SFTP_PORT) || 22,
      username: process.env.SFTP_USERNAME,
      password: process.env.SFTP_PASSWORD,
    };

    if (process.env.SFTP_PRIVATE_KEY_PATH && fs.existsSync(process.env.SFTP_PRIVATE_KEY_PATH)) {
      this.sftpConfig.privateKey = fs.readFileSync(process.env.SFTP_PRIVATE_KEY_PATH);
      delete this.sftpConfig.password;
    }

    this.monitorDir = process.env.MONITOR_DIR || '/';
    this.webhookUrl = process.env.WEBHOOK_URL;
    this.webhookJwtSecret = process.env.WEBHOOK_JWT_SECRET;
    this.webhookJwtIssuer = process.env.WEBHOOK_JWT_ISSUER || 'sftp-monitor';
    this.webhookJwtAudience = process.env.WEBHOOK_JWT_AUDIENCE || 'webhook-receiver';
    this.webhookJwtExpiresIn = process.env.WEBHOOK_JWT_EXPIRES_IN || '1h';
    this.webhookApiKey = process.env.WEBHOOK_API_KEY;
    this.pollInterval = parseInt(process.env.POLL_INTERVAL_MS) || 60000;
    this.cacheFilePath = process.env.CACHE_FILE_PATH || './data/known_files.json';
    this.maxRetryAttempts = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY_MS) || 5000;

    this.knownFiles = this.loadKnownFiles();
    this.intervalId = null;
    this.isRunning = false;

    this.validateConfig();
    this.ensureDataDirectory();
  }

  validateConfig() {
    const required = ['SFTP_HOST', 'SFTP_USERNAME', 'WEBHOOK_URL'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      const error = `Missing required environment variables: ${missing.join(', ')}`;
      logger.error(error);
      throw new Error(error);
    }

    if (!process.env.SFTP_PASSWORD && !process.env.SFTP_PRIVATE_KEY_PATH) {
      const error = 'Either SFTP_PASSWORD or SFTP_PRIVATE_KEY_PATH must be provided';
      logger.error(error);
      throw new Error(error);
    }
  }

  ensureDataDirectory() {
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
        return data;
      }
    } catch (error) {
      logger.warn(`Failed to load known files cache: ${error.message}`);
    }
    return [];
  }

  saveKnownFiles() {
    try {
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.knownFiles, null, 2));
      logger.debug(`Saved ${this.knownFiles.length} known files to cache`);
    } catch (error) {
      logger.error(`Failed to save known files cache: ${error.message}`);
    }
  }

  async connectSftp(retryCount = 0) {
    const sftp = new SftpClient();
    try {
      await sftp.connect(this.sftpConfig);
      logger.debug('SFTP connection established');
      return sftp;
    } catch (error) {
      logger.warn(`SFTP connection failed (attempt ${retryCount + 1}): ${error.message}`);
      
      if (retryCount < this.maxRetryAttempts - 1) {
        await this.delay(this.retryDelay);
        return this.connectSftp(retryCount + 1);
      }
      
      throw error;
    }
  }

  async sendWebhook(fileInfo, retryCount = 0) {
    try {
      const payload = {
        filename: fileInfo.name,
        size: fileInfo.size,
        modifyTime: fileInfo.modifyTime,
        path: path.join(this.monitorDir, fileInfo.name),
        detectedAt: moment().toISOString(),
        type: fileInfo.type
      };

      const response = await axios.post(this.webhookUrl, payload, {
        timeout: 10000,
        headers: this.getAuthHeaders()
      });

      logger.info(`Webhook sent successfully for file: ${fileInfo.name}`, {
        statusCode: response.status,
        filename: fileInfo.name
      });

      return response;
    } catch (error) {
      logger.warn(`Webhook failed (attempt ${retryCount + 1}) for file ${fileInfo.name}: ${error.message}`);
      
      if (retryCount < this.maxRetryAttempts - 1) {
        await this.delay(this.retryDelay);
        return this.sendWebhook(fileInfo, retryCount + 1);
      }
      
      throw error;
    }
  }

  generateJwtToken() {
    if (!this.webhookJwtSecret) {
      logger.debug('No JWT secret configured, skipping JWT token generation');
      return null;
    }

    try {
      const payload = {
        iss: this.webhookJwtIssuer,
        aud: this.webhookJwtAudience,
        iat: Math.floor(Date.now() / 1000),
        service: 'sftp-file-monitor'
      };

      const token = jwt.sign(payload, this.webhookJwtSecret, {
        expiresIn: this.webhookJwtExpiresIn,
        algorithm: 'HS256'
      });

      logger.debug('JWT token generated successfully');
      return token;
    } catch (error) {
      logger.error(`Failed to generate JWT token: ${error.message}`);
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  createFileKey(fileInfo) {
    return `${fileInfo.name}:${fileInfo.size}:${fileInfo.modifyTime}`;
  }

  async checkNewFiles() {
    if (this.isRunning) {
      logger.debug('Check already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    let sftp = null;

    try {
      sftp = await this.connectSftp();
      const files = await sftp.list(this.monitorDir);
      
      const actualFiles = files.filter(file => file.type === '-');
      logger.debug(`Found ${actualFiles.length} files in ${this.monitorDir}`);

      const knownFileKeys = new Set(this.knownFiles);
      const newFiles = [];

      for (const file of actualFiles) {
        const fileKey = this.createFileKey(file);
        
        if (!knownFileKeys.has(fileKey)) {
          newFiles.push(file);
          this.knownFiles.push(fileKey);
          logger.info(`New file detected: ${file.name} (${file.size} bytes)`);
        }
      }

      if (newFiles.length > 0) {
        logger.info(`Processing ${newFiles.length} new files`);
        
        for (const file of newFiles) {
          try {
            await this.sendWebhook(file);
          } catch (error) {
            logger.error(`Failed to send webhook for file ${file.name}: ${error.message}`);
          }
        }

        this.saveKnownFiles();
      } else {
        logger.debug('No new files detected');
      }

    } catch (error) {
      logger.error(`File check failed: ${error.message}`, { error: error.stack });
    } finally {
      if (sftp) {
        try {
          await sftp.end();
          logger.debug('SFTP connection closed');
        } catch (error) {
          logger.warn(`Error closing SFTP connection: ${error.message}`);
        }
      }
      this.isRunning = false;
    }
  }

  start() {
    if (this.intervalId) {
      logger.warn('Monitor is already running');
      return;
    }

    logger.info('Starting SFTP file monitor', {
      host: this.sftpConfig.host,
      monitorDir: this.monitorDir,
      pollInterval: this.pollInterval,
      webhookUrl: this.webhookUrl
    });

    this.checkNewFiles();

    this.intervalId = setInterval(() => {
      this.checkNewFiles();
    }, this.pollInterval);

    logger.info(`Monitor started with ${this.pollInterval}ms interval`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('SFTP file monitor stopped');
    }
  }

  getStatus() {
    return {
      isRunning: !!this.intervalId,
      knownFilesCount: this.knownFiles.length,
      config: {
        host: this.sftpConfig.host,
        monitorDir: this.monitorDir,
        pollInterval: this.pollInterval,
        webhookUrl: this.webhookUrl
      }
    };
  }
}

const monitor = new SftpFileMonitor();

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  monitor.stop();
  process.exit(0);
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
  monitor.start();
}

module.exports = SftpFileMonitor;