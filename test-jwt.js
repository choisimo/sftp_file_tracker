const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT 토큰 생성 테스트
function testJwtGeneration() {
    const secret = process.env.WEBHOOK_JWT_SECRET;
    const issuer = process.env.WEBHOOK_JWT_ISSUER || 'sftp-monitor';
    const audience = process.env.WEBHOOK_JWT_AUDIENCE || 'webhook-receiver';
    const expiresIn = process.env.WEBHOOK_JWT_EXPIRES_IN || '1h';
    
    console.log('JWT Configuration:');
    console.log(`Secret: ${secret ? '[SET]' : '[NOT SET]'}`);
    console.log(`Issuer: ${issuer}`);
    console.log(`Audience: ${audience}`);
    console.log(`Expires In: ${expiresIn}`);
    console.log('');
    
    if (!secret) {
        console.log('❌ JWT Secret is not configured!');
        return;
    }
    
    try {
        const payload = {
            iss: issuer,
            aud: audience,
            iat: Math.floor(Date.now() / 1000),
            service: 'sftp-file-monitor'
        };
        
        const token = jwt.sign(payload, secret, {
            expiresIn: expiresIn,
            algorithm: 'HS256'
        });
        
        console.log('✅ JWT Token Generated Successfully!');
        console.log(`Token: ${token}`);
        console.log('');
        
        // 토큰 디코딩 테스트
        const decoded = jwt.decode(token, { complete: true });
        console.log('Decoded Token Header:', JSON.stringify(decoded.header, null, 2));
        console.log('Decoded Token Payload:', JSON.stringify(decoded.payload, null, 2));
        console.log('');
        
        // 토큰 검증 테스트
        const verified = jwt.verify(token, secret);
        console.log('✅ Token Verification Successful!');
        console.log('Verified Payload:', JSON.stringify(verified, null, 2));
        
        // Authorization 헤더 형식 출력
        console.log('');
        console.log('Authorization Header:');
        console.log(`Bearer ${token}`);
        
    } catch (error) {
        console.log('❌ JWT Token Generation Failed:', error.message);
    }
}

// 웹훅 요청 시뮬레이션
async function testWebhookRequest() {
    const axios = require('axios');
    
    const webhookUrl = process.env.WEBHOOK_URL;
    const secret = process.env.WEBHOOK_JWT_SECRET;
    
    if (!secret) {
        console.log('❌ Cannot test webhook - JWT secret not configured');
        return;
    }
    
    try {
        const payload = {
            filename: 'test-jwt-auth.txt',
            size: 100,
            modifyTime: new Date().toISOString(),
            path: '/app/watch/test-jwt-auth.txt',
            detectedAt: new Date().toISOString(),
            type: 'file'
        };
        
        const jwtPayload = {
            iss: process.env.WEBHOOK_JWT_ISSUER || 'sftp-monitor',
            aud: process.env.WEBHOOK_JWT_AUDIENCE || 'webhook-receiver',
            iat: Math.floor(Date.now() / 1000),
            service: 'sftp-file-monitor'
        };
        
        const token = jwt.sign(jwtPayload, secret, {
            expiresIn: process.env.WEBHOOK_JWT_EXPIRES_IN || '1h',
            algorithm: 'HS256'
        });
        
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'SFTP-File-Monitor/1.0.0',
            'Authorization': `Bearer ${token}`
        };
        
        console.log('🚀 Testing Webhook Request...');
        console.log(`URL: ${webhookUrl}`);
        console.log('Headers:', JSON.stringify(headers, null, 2));
        console.log('Payload:', JSON.stringify(payload, null, 2));
        console.log('');
        
        // 실제로는 요청을 보내지 않고, 요청 정보만 출력
        console.log('ℹ️  Request prepared but not sent (for testing purposes)');
        
    } catch (error) {
        console.log('❌ Webhook request preparation failed:', error.message);
    }
}

console.log('=== JWT Authentication Test ===');
console.log('');

testJwtGeneration();
console.log('');
console.log('=== Webhook Request Test ===');
console.log('');
testWebhookRequest();