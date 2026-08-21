#!/bin/bash
set -e

# 콘솔 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN} 🚀 Plex Meta Helper (PMH) 자동 설치를 시작합니다.${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. sudo 권한 및 실행 유저 확인
if [ "$EUID" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
else
    SUDO=""
fi

# 2. 설치 디렉토리 생성 및 이동
TARGET_DIR="./pmh"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"
INSTALL_PATH=$(pwd)

# 3. 시스템 필수 패키지 설치
echo -e "\n${YELLOW}[1/4] 시스템 필수 패키지 확인 및 설치 중...${NC}"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq python3 python3-pip curl

# 4. 파이썬 의존성 라이브러리 설치 (PEP 668 최신 리눅스 대응)
echo -e "\n${YELLOW}[2/4] 파이썬 의존성 패키지 설치 중...${NC}"
PIP_PKGS="flask flask-cors pyyaml plexapi psycopg2-binary"

if pip3 install $PIP_PKGS >/dev/null 2>&1; then
    echo -e "${GREEN}✔ 파이썬 패키지 설치 완료${NC}"
else
    # Ubuntu 23.04+, Debian 12+ 등 외부 환경 관리 에러 대응
    pip3 install --break-system-packages $PIP_PKGS >/dev/null 2>&1 || pip3 install $PIP_PKGS
    echo -e "${GREEN}✔ 파이썬 패키지 설치 완료 (--break-system-packages)${NC}"
fi

# 5. 최신 PMH 서버 스크립트 다운로드
echo -e "\n${YELLOW}[3/4] 최신 PMH 서버 파일 다운로드 중...${NC}"
curl -fsSL -O https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_server.py

# 6. 설정 파일 확인 (기존 설정 보호)
echo -e "\n${YELLOW}[4/4] 환경 설정 파일 확인 중...${NC}"
if [ -f "pmh_config.yaml" ]; then
    echo -e "${CYAN}ℹ 기존 pmh_config.yaml 파일이 이미 존재하므로 덮어쓰지 않고 유지합니다.${NC}"
else
    curl -fsSL https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_config.master_sample.yaml -o pmh_config.yaml
    echo -e "${GREEN}✔ 기본 설정 파일(pmh_config.yaml)을 생성했습니다.${NC}"
fi

# 7. 설치 완료 및 다음 단계 안내
echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN} 🎉 PMH 설치가 성공적으로 완료되었습니다!${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "아래 명령어를 실행하여 설정을 진행하고 서버를 시작하세요:\n"
echo -e "  ${CYAN}cd ${INSTALL_PATH}${NC}"
echo -e "  ${CYAN}nano pmh_config.yaml${NC}   # Plex URL, 토큰, APIKEY 등 입력"
echo -e "  ${CYAN}python3 pmh_server.py${NC}  # 서버 실행 테스트\n"
