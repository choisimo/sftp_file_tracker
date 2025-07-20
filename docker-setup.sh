#!/bin/bash

# Docker File Monitor 빌드 및 실행 스크립트

set -e

echo "🐳 Docker File Monitor 설정을 시작합니다..."

# 현재 디렉토리 확인
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile이 없습니다. 올바른 디렉토리에서 실행해주세요."
    exit 1
fi

# 필요한 디렉토리 생성
echo "📁 필요한 디렉토리를 생성합니다..."
mkdir -p watch logs data

# Docker 이미지 빌드
echo "🔨 Docker 이미지를 빌드합니다..."
docker build -t file-monitor:latest .

echo "✅ Docker 이미지 빌드가 완료되었습니다!"
echo ""

# 실행 방법 안내
echo "🚀 실행 방법:"
echo ""
echo "1. Docker Compose로 실행 (권장):"
echo "   docker-compose up -d"
echo ""
echo "2. Docker 명령어로 직접 실행:"
echo "   docker run -d \\"
echo "     --name file-monitor \\"
echo "     -p 13030:13030 \\"
echo "     -v \$(pwd)/watch:/app/watch:ro \\"
echo "     -v \$(pwd)/logs:/app/logs \\"
echo "     -v \$(pwd)/data:/app/data \\"
echo "     -e WEBHOOK_URL=https://n8n.nodove.com/webhook/nas/detect/new \\"
echo "     file-monitor:latest"
echo ""
echo "3. 상태 확인:"
echo "   docker-compose logs -f file-monitor"
echo "   또는"
echo "   docker logs -f file-monitor"
echo ""
echo "4. 중지:"
echo "   docker-compose down"
echo "   또는"
echo "   docker stop file-monitor && docker rm file-monitor"
echo ""
echo "📂 모니터링할 파일을 './watch' 폴더에 넣으면 감지됩니다."
echo "📊 로그는 './logs' 폴더에서 확인할 수 있습니다."