const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const moment = require('moment');
require('dotenv').config();

const logger = require('./src/logger');
const SftpFileMonitor = require('./server');

class WebGUI {
    constructor() {
        this.app = express();
        this.port = process.env.GUI_PORT || 3000;
        this.envFile = path.resolve('.env');
        this.monitor = null;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, 'public')));
    }
    
    setupRoutes() {
        // 메인 페이지
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
        
        // 설정 조회
        this.app.get('/api/config', (req, res) => {
            try {
                const config = this.loadConfig();
                res.json({
                    success: true,
                    config: this.sanitizeConfig(config)
                });
            } catch (error) {
                logger.error('Failed to load config:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 설정 저장
        this.app.post('/api/config', (req, res) => {
            try {
                const newConfig = req.body;
                this.saveConfig(newConfig);
                
                // 모니터 재시작
                this.restartMonitor();
                
                res.json({
                    success: true,
                    message: '설정이 저장되고 모니터가 재시작되었습니다.'
                });
            } catch (error) {
                logger.error('Failed to save config:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // JWT 시크릿 생성
        this.app.post('/api/generate-jwt-secret', (req, res) => {
            try {
                const secret = crypto.randomBytes(64).toString('hex');
                res.json({
                    success: true,
                    secret: secret,
                    message: 'JWT 시크릿이 생성되었습니다.'
                });
            } catch (error) {
                logger.error('Failed to generate JWT secret:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // JWT 토큰 생성 및 검증
        this.app.post('/api/test-jwt', (req, res) => {
            try {
                const { secret, issuer, audience, expiresIn } = req.body;
                
                if (!secret) {
                    return res.status(400).json({
                        success: false,
                        error: 'JWT 시크릿이 필요합니다.'
                    });
                }
                
                const payload = {
                    iss: issuer || 'sftp-monitor',
                    aud: audience || 'webhook-receiver',
                    iat: Math.floor(Date.now() / 1000),
                    service: 'sftp-file-monitor'
                };
                
                const token = jwt.sign(payload, secret, {
                    expiresIn: expiresIn || '1h',
                    algorithm: 'HS256'
                });
                
                // 토큰 검증
                const verified = jwt.verify(token, secret);
                const decoded = jwt.decode(token, { complete: true });
                
                res.json({
                    success: true,
                    token: token,
                    decoded: decoded,
                    verified: verified,
                    authHeader: `Bearer ${token}`
                });
            } catch (error) {
                logger.error('JWT test failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 웹훅 테스트
        this.app.post('/api/test-webhook', async (req, res) => {
            try {
                const { url, useAuth, secret, issuer, audience, expiresIn, apiKey } = req.body;
                
                if (!url) {
                    return res.status(400).json({
                        success: false,
                        error: '웹훅 URL이 필요합니다.'
                    });
                }
                
                const payload = {
                    filename: 'test-file.txt',
                    size: 1024,
                    modifyTime: moment().toISOString(),
                    path: '/test/test-file.txt',
                    detectedAt: moment().toISOString(),
                    type: 'file',
                    testMessage: 'GUI에서 전송된 테스트 웹훅입니다.'
                };
                
                const headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'SFTP-File-Monitor-GUI/1.0.0'
                };
                
                if (useAuth) {
                    if (secret) {
                        // JWT 인증
                        const jwtPayload = {
                            iss: issuer || 'sftp-monitor',
                            aud: audience || 'webhook-receiver',
                            iat: Math.floor(Date.now() / 1000),
                            service: 'sftp-file-monitor'
                        };
                        
                        const token = jwt.sign(jwtPayload, secret, {
                            expiresIn: expiresIn || '1h',
                            algorithm: 'HS256'
                        });
                        
                        headers['Authorization'] = `Bearer ${token}`;
                    } else if (apiKey) {
                        // API Key 인증
                        headers['Authorization'] = `Bearer ${apiKey}`;
                        headers['X-API-Key'] = apiKey;
                    }
                }
                
                const startTime = Date.now();
                const response = await axios.post(url, payload, {
                    headers: headers,
                    timeout: 10000,
                    validateStatus: () => true // 모든 상태코드 허용
                });
                const endTime = Date.now();
                
                res.json({
                    success: true,
                    response: {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                        data: response.data,
                        responseTime: `${endTime - startTime}ms`
                    },
                    request: {
                        url: url,
                        headers: headers,
                        payload: payload
                    }
                });
                
            } catch (error) {
                logger.error('Webhook test failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    details: {
                        code: error.code,
                        message: error.message,
                        response: error.response ? {
                            status: error.response.status,
                            data: error.response.data
                        } : null
                    }
                });
            }
        });
        
        // 모니터 상태 조회
        this.app.get('/api/status', (req, res) => {
            try {
                const status = this.monitor ? this.monitor.getStatus() : { isRunning: false };
                const diagnostics = this.getDiagnostics();
                
                res.json({
                    success: true,
                    status: status,
                    diagnostics: diagnostics
                });
            } catch (error) {
                logger.error('Failed to get status:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 모니터 제어 (시작/정지)
        this.app.post('/api/monitor/:action', (req, res) => {
            try {
                const action = req.params.action;
                
                if (action === 'start') {
                    this.startMonitor();
                    res.json({
                        success: true,
                        message: '모니터가 시작되었습니다.'
                    });
                } else if (action === 'stop') {
                    this.stopMonitor();
                    res.json({
                        success: true,
                        message: '모니터가 정지되었습니다.'
                    });
                } else if (action === 'restart') {
                    this.restartMonitor();
                    res.json({
                        success: true,
                        message: '모니터가 재시작되었습니다.'
                    });
                } else {
                    res.status(400).json({
                        success: false,
                        error: '유효하지 않은 액션입니다. (start, stop, restart만 가능)'
                    });
                }
            } catch (error) {
                logger.error(`Monitor ${req.params.action} failed:`, error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }
    
    setupErrorHandling() {
        this.app.use((error, req, res, next) => {
            logger.error('Express error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }
    
    loadConfig() {
        if (!fs.existsSync(this.envFile)) {
            throw new Error('.env 파일을 찾을 수 없습니다.');
        }
        
        const envContent = fs.readFileSync(this.envFile, 'utf8');
        const config = {};
        
        envContent.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    config[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
        
        return config;
    }
    
    sanitizeConfig(config) {
        const sanitized = { ...config };
        // 비밀번호와 시크릿은 마스킹
        if (sanitized.SFTP_PASSWORD) {
            sanitized.SFTP_PASSWORD = '***masked***';
        }
        if (sanitized.WEBHOOK_JWT_SECRET) {
            sanitized.WEBHOOK_JWT_SECRET = '***masked***';
        }
        if (sanitized.WEBHOOK_API_KEY) {
            sanitized.WEBHOOK_API_KEY = '***masked***';
        }
        return sanitized;
    }
    
    saveConfig(newConfig) {
        // 기존 설정 로드
        const currentConfig = this.loadConfig();
        
        // 새로운 설정으로 업데이트
        const updatedConfig = { ...currentConfig, ...newConfig };
        
        // .env 파일 생성
        let envContent = '# SFTP File Monitor Configuration\n';
        envContent += '# Updated: ' + new Date().toISOString() + '\n\n';
        
        // 섹션별로 정리
        const sections = {
            'SFTP 서버 설정': ['SFTP_HOST', 'SFTP_PORT', 'SFTP_USERNAME', 'SFTP_PASSWORD', 'SFTP_PRIVATE_KEY_PATH'],
            '모니터링 설정': ['MONITOR_DIR', 'POLL_INTERVAL_MS'],
            '웹훅 설정': ['WEBHOOK_URL', 'WEBHOOK_JWT_SECRET', 'WEBHOOK_JWT_ISSUER', 'WEBHOOK_JWT_AUDIENCE', 'WEBHOOK_JWT_EXPIRES_IN', 'WEBHOOK_API_KEY'],
            '로깅 설정': ['LOG_LEVEL', 'LOG_FILE_PATH', 'LOG_MAX_SIZE', 'LOG_MAX_FILES'],
            '캐시 파일': ['CACHE_FILE_PATH'],
            '재시도 설정': ['MAX_RETRY_ATTEMPTS', 'RETRY_DELAY_MS'],
            '환경 설정': ['NODE_ENV', 'IGNORE_INITIAL_FILES', 'SCAN_EXISTING', 'GUI_PORT']
        };
        
        Object.entries(sections).forEach(([sectionName, keys]) => {
            envContent += `# ${sectionName}\n`;
            keys.forEach(key => {
                if (updatedConfig[key] !== undefined) {
                    envContent += `${key}=${updatedConfig[key]}\n`;
                }
            });
            envContent += '\n';
        });
        
        fs.writeFileSync(this.envFile, envContent);
        
        // 환경변수 재로드
        delete require.cache[require.resolve('dotenv')];
        require('dotenv').config();
    }
    
    getDiagnostics() {
        const diagnostics = {
            errors: [],
            warnings: [],
            suggestions: []
        };
        
        try {
            const config = this.loadConfig();
            
            // 필수 설정 확인
            const required = ['SFTP_HOST', 'SFTP_USERNAME', 'WEBHOOK_URL'];
            required.forEach(key => {
                if (!config[key]) {
                    diagnostics.errors.push({
                        type: 'missing_config',
                        message: `필수 설정이 누락되었습니다: ${key}`,
                        solution: `${key} 값을 설정해주세요.`
                    });
                }
            });
            
            // 인증 설정 확인
            if (!config.SFTP_PASSWORD && !config.SFTP_PRIVATE_KEY_PATH) {
                diagnostics.errors.push({
                    type: 'missing_auth',
                    message: 'SFTP 인증 정보가 없습니다.',
                    solution: 'SFTP_PASSWORD 또는 SFTP_PRIVATE_KEY_PATH 중 하나를 설정해주세요.'
                });
            }
            
            // 웹훅 인증 확인
            if (!config.WEBHOOK_JWT_SECRET && !config.WEBHOOK_API_KEY) {
                diagnostics.warnings.push({
                    type: 'no_webhook_auth',
                    message: '웹훅 인증이 설정되지 않았습니다.',
                    solution: 'WEBHOOK_JWT_SECRET 또는 WEBHOOK_API_KEY를 설정하여 보안을 강화하세요.'
                });
            }
            
            // URL 형식 확인
            if (config.WEBHOOK_URL && !config.WEBHOOK_URL.match(/^https?:\/\/.+/)) {
                diagnostics.errors.push({
                    type: 'invalid_url',
                    message: '웹훅 URL 형식이 올바르지 않습니다.',
                    solution: 'http:// 또는 https://로 시작하는 완전한 URL을 입력해주세요.'
                });
            }
            
            // 포트 번호 확인
            if (config.SFTP_PORT && (isNaN(config.SFTP_PORT) || config.SFTP_PORT < 1 || config.SFTP_PORT > 65535)) {
                diagnostics.errors.push({
                    type: 'invalid_port',
                    message: 'SFTP 포트 번호가 올바르지 않습니다.',
                    solution: '1-65535 사이의 유효한 포트 번호를 입력해주세요.'
                });
            }
            
            // 디렉토리 경로 확인
            if (config.MONITOR_DIR && !path.isAbsolute(config.MONITOR_DIR)) {
                diagnostics.suggestions.push({
                    type: 'relative_path',
                    message: '모니터링 디렉토리가 상대 경로입니다.',
                    solution: '절대 경로 사용을 권장합니다.'
                });
            }
            
            // 폴링 간격 확인
            if (config.POLL_INTERVAL_MS && config.POLL_INTERVAL_MS < 10000) {
                diagnostics.warnings.push({
                    type: 'short_interval',
                    message: '폴링 간격이 너무 짧습니다.',
                    solution: '서버 부하를 줄이기 위해 10초(10000ms) 이상을 권장합니다.'
                });
            }
            
        } catch (error) {
            diagnostics.errors.push({
                type: 'config_error',
                message: '설정 파일을 읽는 중 오류가 발생했습니다.',
                solution: '.env 파일의 형식을 확인해주세요.'
            });
        }
        
        return diagnostics;
    }
    
    startMonitor() {
        if (this.monitor) {
            this.monitor.stop();
        }
        
        try {
            this.monitor = new SftpFileMonitor();
            this.monitor.start();
            logger.info('File monitor started from GUI');
        } catch (error) {
            logger.error('Failed to start monitor from GUI:', error);
            throw error;
        }
    }
    
    stopMonitor() {
        if (this.monitor) {
            this.monitor.stop();
            this.monitor = null;
            logger.info('File monitor stopped from GUI');
        }
    }
    
    restartMonitor() {
        this.stopMonitor();
        setTimeout(() => {
            this.startMonitor();
        }, 1000);
    }
    
    start() {
        this.app.listen(this.port, () => {
            logger.info(`Web GUI server started on port ${this.port}`);
            logger.info(`Access the GUI at: http://localhost:${this.port}`);
        });
        
        // 초기 모니터 시작
        setTimeout(() => {
            try {
                this.startMonitor();
            } catch (error) {
                logger.warn('Initial monitor start failed:', error.message);
            }
        }, 2000);
    }
}

module.exports = WebGUI;

if (require.main === module) {
    const gui = new WebGUI();
    gui.start();
}