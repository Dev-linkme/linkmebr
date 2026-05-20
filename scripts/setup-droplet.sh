#!/bin/bash
# Executar como root no Droplet Ubuntu na primeira vez:
#   curl -fsSL https://raw.githubusercontent.com/Dev-linkme/linkmebr/main/scripts/setup-droplet.sh | bash

set -e

echo "==> Atualizando sistema..."
apt-get update -y && apt-get upgrade -y

echo "==> Instalando Docker..."
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker

echo "==> Instalando Git..."
apt-get install -y git

echo "==> Clonando repositório..."
git clone https://github.com/Dev-linkme/linkmebr.git /opt/linkmebr
cd /opt/linkmebr

echo ""
echo "==> PRÓXIMO PASSO: crie o arquivo de variáveis de ambiente"
echo "    nano /opt/linkmebr/backend/.env"
echo ""
echo "    Conteúdo necessário:"
echo "    DATABASE_URL=postgresql://doadmin:<SENHA>@dbaas-db-4648706-do-user-37224602-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
echo "    JWT_SECRET=<string_aleatória_32_bytes>"
echo "    JWT_EXPIRES_IN=8h"
echo "    PORT=8080"
echo "    NODE_ENV=production"
echo ""
echo "    Após criar o .env, execute:"
echo "    docker compose -f /opt/linkmebr/docker-compose.prod.yml up -d --build"
