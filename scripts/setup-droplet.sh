#!/bin/bash
# Executar como root no Droplet Ubuntu na primeira vez:
#   curl -fsSL https://raw.githubusercontent.com/Dev-linkme/linkmebr/main/scripts/setup-droplet.sh | bash

set -e

DEPLOY_USER="projeto"

echo "==> Atualizando sistema..."
apt-get update -y && apt-get upgrade -y

echo "==> Instalando Docker e Git..."
apt-get install -y ca-certificates curl gnupg git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker

echo "==> Criando usuário '${DEPLOY_USER}' (se não existir)..."
id "${DEPLOY_USER}" &>/dev/null || useradd -m -s /bin/bash "${DEPLOY_USER}"

echo "==> Adicionando '${DEPLOY_USER}' ao grupo docker..."
usermod -aG docker "${DEPLOY_USER}"

echo "==> Clonando repositório em /opt/linkmebr..."
git clone https://github.com/Dev-linkme/linkmebr.git /opt/linkmebr
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /opt/linkmebr

echo ""
echo "============================================================"
echo " PRÓXIMOS PASSOS — execute como ${DEPLOY_USER}"
echo "============================================================"
echo ""
echo "1. Reconecte via SSH para o grupo docker ter efeito:"
echo "   ssh projeto@<IP_DO_DROPLET>"
echo ""
echo "2. Crie o arquivo de variáveis de ambiente:"
echo "   nano /opt/linkmebr/backend/.env"
echo ""
echo "   Conteúdo:"
echo "   DATABASE_URL=postgresql://doadmin:<SENHA>@dbaas-db-4648706-do-user-37224602-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
echo "   JWT_SECRET=<string aleatória — gere com: openssl rand -hex 32>"
echo "   JWT_EXPIRES_IN=8h"
echo "   PORT=8080"
echo "   NODE_ENV=production"
echo ""
echo "3. Suba os containers:"
echo "   docker compose -f /opt/linkmebr/docker-compose.prod.yml up -d --build"
echo ""
echo "============================================================"
