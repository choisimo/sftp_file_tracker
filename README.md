# File Monitor

로컬 또는 원격 SFTP 서버의 새로운 파일을 감지하여 지정된 웹훅으로 알림을 보내는 Node.js 서비스입니다.

## 🎯 주요 기능

- **🖥️ 로컬 파일 모니터링**: 현재 서버의 지정된 폴더를 실시간 감시 (chokidar 사용)
- **🌐 SFTP 파일 모니터링**: 원격 SFTP 서버의 지정된 폴더를 주기적으로 모니터링
- **🔄 중복 알림 방지**: 이미 처리된 파일은 다시 알림을 보내지 않음
- **📡 웹훅 알림**: 새 파일 발견 시 지정된 웹훅 URL로 POST 요청 전송
- **🛡️ 강건한 오류 처리**: 연결 실패, 재시도 로직, 로깅 시스템
- **⚙️ PM2 지원**: 프로덕션 환경에서의 프로세스 관리

## 🚀 빠른 시작

### 1. 설치

```bash
# 저장소 클론 (또는 파일 복사)
cd file-monitor

# 설치 스크립트 실행
./install.sh
```

### 2-A. Docker로 실행 (가장 간단)

가장 쉬운 방법으로 Docker 컨테이너로 실행:

```bash
# Docker 이미지 빌드
npm run docker:build

# Docker Compose로 실행
npm run docker:up

# 로그 확인
npm run docker:logs

# 중지
npm run docker:down
```

**Docker 실행 후 테스트:**
```bash
# 테스트 파일 생성 (watch 폴더에)
echo "테스트 파일입니다" > watch/test.txt

# 로그에서 웹훅 전송 확인
npm run docker:logs
```

### 2-B. 로컬 파일 모니터링 (직접 실행)

현재 서버의 폴더를 실시간으로 모니터링하려면:

```bash
# 로컬 환경설정 파일 사용
cp .env.local.example .env.local

# .env.local 파일 편집
# MONITOR_DIR=./watch  # 현재 디렉토리의 watch 폴더
# MONITOR_DIR=.        # 현재 디렉토리 전체
# MONITOR_DIR=/path/to/folder  # 특정 절대 경로
```

### 2-C. SFTP 파일 모니터링

원격 SFTP 서버를 모니터링하려면:

```bash
# SFTP 환경설정 파일 편집
nano .env

# SFTP 서버 설정
SFTP_HOST=your-sftp-server.com
SFTP_PORT=22
SFTP_USERNAME=your-username
SFTP_PASSWORD=your-password

# 모니터링 설정
MONITOR_DIR=/path/to/watch
POLL_INTERVAL_MS=60000

# 웹훅 설정
WEBHOOK_URL=https://n8n.nodove.com/webhook/nas/detect/new
```

### 3. 실행

#### 🐳 Docker 실행 (권장)

```bash
# 빌드 및 실행
npm run docker:build    # Docker 이미지 빌드
npm run docker:up       # 백그라운드에서 실행

# 관리 명령어
npm run docker:logs     # 실시간 로그 확인
npm run docker:restart  # 재시작
npm run docker:down     # 중지 및 제거
```

#### 💻 직접 실행

```bash
# 로컬 파일 모니터링 (실시간)
npm run local         # 일반 실행
npm run local:dev     # 개발 모드

# SFTP 파일 모니터링 (주기적)
npm run dev          # 개발 모드
npm start           # 일반 실행

# 프로덕션 모드 (PM2 사용)
npm run pm2:start:local    # 로컬 모니터링
npm run pm2:start         # SFTP 모니터링

# 상태 확인
pm2 status

# 로그 확인
pm2 logs file-monitor
```

## 📋 환경 변수

### 로컬 파일 모니터링 (.env.local)

| 변수명 | 필수 | 기본값 | 설명 |
|--------|------|--------|------|
| `MONITOR_DIR` | ❌ | ./watch | 모니터링할 로컬 폴더 경로 |
| `WEBHOOK_URL` | ✅ | - | 알림을 보낼 웹훅 URL |
| `IGNORE_INITIAL_FILES` | ❌ | true | 시작시 기존 파일 무시 여부 |
| `SCAN_EXISTING` | ❌ | true | 시작시 기존 파일 스캔하여 캐시 저장 |
| `LOG_LEVEL` | ❌ | info | 로그 레벨 (debug, info, warn, error) |
| `MAX_RETRY_ATTEMPTS` | ❌ | 3 | 재시도 횟수 |
| `RETRY_DELAY_MS` | ❌ | 5000 | 재시도 간격 (밀리초) |

### SFTP 파일 모니터링 (.env)

| 변수명 | 필수 | 기본값 | 설명 |
|--------|------|--------|------|
| `SFTP_HOST` | ✅ | - | SFTP 서버 호스트 |
| `SFTP_PORT` | ❌ | 22 | SFTP 서버 포트 |
| `SFTP_USERNAME` | ✅ | - | SFTP 사용자명 |
| `SFTP_PASSWORD` | ✅* | - | SFTP 비밀번호 |
| `SFTP_PRIVATE_KEY_PATH` | ✅* | - | SSH 키 파일 경로 |
| `MONITOR_DIR` | ❌ | / | 모니터링할 폴더 경로 |
| `POLL_INTERVAL_MS` | ❌ | 60000 | 확인 주기 (밀리초) |
| `WEBHOOK_URL` | ✅ | - | 알림을 보낼 웹훅 URL |
| `LOG_LEVEL` | ❌ | info | 로그 레벨 (debug, info, warn, error) |
| `MAX_RETRY_ATTEMPTS` | ❌ | 3 | 재시도 횟수 |
| `RETRY_DELAY_MS` | ❌ | 5000 | 재시도 간격 (밀리초) |

*SFTP_PASSWORD 또는 SFTP_PRIVATE_KEY_PATH 중 하나는 필수

## 📡 웹훅 페이로드

### 로컬 파일 모니터링 시

```json
{
  "filename": "새로운파일.txt",
  "size": 1024,
  "modifyTime": "2023-12-01T10:30:00.000Z",
  "path": "./watch/새로운파일.txt",
  "absolutePath": "/full/path/to/file.txt",
  "detectedAt": "2023-12-01T10:30:15.123Z",
  "type": "file",
  "event": "add"
}
```

### SFTP 파일 모니터링 시

```json
{
  "filename": "새로운파일.txt",
  "size": 1024,
  "modifyTime": "2023-12-01T10:30:00.000Z",
  "path": "/upload/새로운파일.txt",
  "detectedAt": "2023-12-01T10:30:15.123Z",
  "type": "-"
}
```

## 📁 프로젝트 구조

```
file-monitor/
├── server.js                    # SFTP 모니터링 서버
├── local-server.js              # 로컬 파일 모니터링 서버
├── src/
│   └── logger.js                # 로깅 시스템
├── package.json                 # 패키지 설정
├── ecosystem.config.js          # SFTP PM2 설정
├── ecosystem.local.config.js    # 로컬 PM2 설정
├── .env.example                 # SFTP 환경변수 템플릿
├── .env.local.example          # 로컬 환경변수 템플릿
├── .env.docker                 # Docker 환경변수
├── .env / .env.local           # 환경변수 (실제 값)
├── Dockerfile                  # Docker 이미지 설정
├── docker-compose.yml          # Docker Compose 설정  
├── .dockerignore              # Docker 빌드 제외 파일
├── docker-setup.sh            # Docker 빌드 스크립트
├── install.sh                 # 설치 스크립트
├── watch/                     # 기본 감시 폴더 (로컬용)
├── logs/                      # 로그 파일
└── data/                      # 캐시 데이터
    └── known_files.json       # 알려진 파일 목록
```

## 🛠️ NPM 스크립트

```bash
# 🐳 Docker 명령어 (권장)
npm run docker:build     # Docker 이미지 빌드
npm run docker:up        # Docker Compose로 실행  
npm run docker:down      # 중지 및 제거
npm run docker:logs      # 실시간 로그 확인
npm run docker:restart   # 재시작

# 💻 직접 실행
npm run local            # 로컬 파일 모니터링
npm run local:dev        # 로컬 개발 모드 (nodemon)
npm start               # SFTP 모니터링
npm run dev            # SFTP 개발 모드 (nodemon)

# ⚙️ PM2 프로덕션 실행
npm run pm2:start:local    # 로컬 모니터링 시작
npm run pm2:start         # SFTP 모니터링 시작
npm run pm2:stop          # 중지
npm run pm2:restart       # 재시작
```

## 🐳 Docker 사용법

### 기본 실행

```bash
# 1단계: 이미지 빌드
npm run docker:build

# 2단계: 실행 (포트 13030에서 서비스됩니다)
npm run docker:up

# 3단계: 테스트
echo "테스트 파일" > watch/test.txt

# 4단계: 로그 확인
npm run docker:logs
```

### Docker 볼륨 매핑

```bash
# watch/ - 모니터링할 파일들을 여기에 추가
# logs/  - 애플리케이션 로그 출력
# data/  - 파일 캐시 데이터

# 다른 폴더를 모니터링하려면 docker-compose.yml 수정:
volumes:
  - /your/custom/path:/app/watch:ro
```

### Docker 환경변수 수정

```bash
# docker-compose.yml에서 환경변수 변경
environment:
  - WEBHOOK_URL=https://your-webhook-url.com
  - LOG_LEVEL=debug
  - IGNORE_INITIAL_FILES=false
```

## 📊 로깅

애플리케이션은 다음 위치에 로그를 저장합니다:

- `./logs/file-monitor.log` - 일반 로그
- `./logs/error.log` - 오류 로그
- `./logs/pm2-*.log` - PM2 관련 로그

로그 레벨을 `LOG_LEVEL` 환경변수로 조정할 수 있습니다.

## 🔧 고급 설정

### 로컬 파일 모니터링 설정

```bash
# 현재 디렉토리 전체 모니터링
MONITOR_DIR=.

# 특정 폴더만 모니터링
MONITOR_DIR=./uploads

# 절대 경로로 지정
MONITOR_DIR=/var/www/uploads

# 기존 파일들도 초기 알림 전송하려면
IGNORE_INITIAL_FILES=false

# 시작시 기존 파일 스캔 안하려면
SCAN_EXISTING=false
```

### SFTP 설정

#### SSH 키 인증 사용

비밀번호 대신 SSH 키를 사용하려면:

```bash
# .env 파일에서
SFTP_PRIVATE_KEY_PATH=/path/to/your/private-key
# SFTP_PASSWORD는 주석 처리하거나 제거
```

### 모니터링 주기 조정

```bash
# 30초마다 확인 (SFTP만 해당)
POLL_INTERVAL_MS=30000

# 5분마다 확인
POLL_INTERVAL_MS=300000
```

### 로그 레벨 조정

```bash
# 디버그 모드 (상세한 로그)
LOG_LEVEL=debug

# 경고 및 오류만
LOG_LEVEL=warn
```

## 🚨 문제 해결

### 일반적인 문제들

1. **로컬 파일 접근 권한 오류**
   - 모니터링 폴더의 읽기 권한 확인
   - 프로세스 실행 사용자 권한 확인

2. **SFTP 연결 실패**
   - 호스트, 포트, 인증 정보 확인
   - 방화벽 설정 확인
   - SSH 키 권한 확인 (`chmod 600 private-key`)

3. **웹훅 전송 실패**
   - 웹훅 URL 유효성 확인
   - 네트워크 연결 상태 확인
   - 대상 서버 응답 확인

4. **높은 메모리 사용**
   - 모니터링 주기 늘리기 (SFTP만 해당)
   - 로그 레벨 조정
   - PM2 메모리 제한 설정

### 로그 확인

```bash
# 실시간 로그 보기
tail -f logs/file-monitor.log

# PM2 로그 (프로덕션)
pm2 logs file-monitor

# 오류 로그만
tail -f logs/error.log
```

### 테스트 방법

```bash
# 로컬 모니터링 테스트
echo "test file" > watch/test.txt

# 로그에서 웹훅 전송 확인
tail -f logs/file-monitor.log
```

## 🔒 보안 고려사항

- `.env` 파일을 버전 관리에 포함하지 마세요
- SSH 키 파일의 권한을 적절히 설정하세요 (`chmod 600`)
- SFTP 서버에 최소 권한으로 접근하세요
- 웹훅 URL에 인증 토큰이 포함된 경우 노출 주의

## 🤝 기여하기

버그 리포트, 기능 제안, 풀 리퀘스트를 환영합니다.

## 📄 라이선스

MIT License

---

더 자세한 정보나 지원이 필요하시면 이슈를 생성해 주세요.