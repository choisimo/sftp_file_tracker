#!/bin/bash

# SFTP File Monitor 설치 스크립트

set -e

echo "🚀 SFTP File Monitor 설치를 시작합니다..."

# Node.js 버전 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    echo "Node.js 16.0.0 이상을 설치해주세요."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js 버전이 $REQUIRED_VERSION 이상이어야 합니다. 현재 버전: $NODE_VERSION"
    exit 1
fi

echo "✅ Node.js 버전 확인 완료: $NODE_VERSION"

# npm 패키지 설치
echo "📦 npm 패키지를 설치합니다..."
npm install

# 필요한 디렉토리 생성
mkdir -p logs data

echo "📁 필요한 디렉토리를 생성했습니다."

# .env 파일 확인
if [ ! -f .env ]; then
    echo "⚠️  .env 파일이 없습니다."
    echo "📋 .env.example을 참고하여 .env 파일을 생성해주세요."
    cp .env.example .env
    echo "📄 .env 파일 템플릿을 생성했습니다."
fi

# PM2 전역 설치 확인
if ! command -v pm2 &> /dev/null; then
    echo "📦 PM2를 전역으로 설치합니다..."
    npm install -g pm2
fi

echo "✅ 설치가 완료되었습니다!"
echo ""
echo "🔧 다음 단계:"
echo "1. .env 파일을 편집하여 SFTP 서버 정보를 입력하세요"
echo "2. 테스트 실행: npm run dev"
echo "3. 프로덕션 실행: npm run pm2:start"
echo ""
echo "📖 자세한 사용법은 README.md를 참고하세요."