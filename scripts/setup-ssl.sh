#!/bin/bash
# Executar como root no Droplet APÓS o setup inicial e com DNS já apontando para o servidor.
# ssh root@157.245.139.143
# bash /opt/linkmebr/scripts/setup-ssl.sh

set -e

DOMAIN="linkeme.tec.br"
EMAIL="jrs.guarata@gmail.com"

echo "==> Instalando Nginx e Certbot..."
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Ativando configuração do Nginx..."
cp /opt/linkmebr/nginx/linkmebr.conf /etc/nginx/sites-available/linkmebr
ln -sf /etc/nginx/sites-available/linkmebr /etc/nginx/sites-enabled/linkmebr
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl enable nginx && systemctl reload nginx

echo "==> Obtendo certificado SSL Let's Encrypt..."
certbot --nginx \
  -d "${DOMAIN}" \
  -d "www.${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --redirect

echo "==> Verificando renovação automática..."
systemctl enable certbot.timer
certbot renew --dry-run

echo ""
echo "============================================================"
echo " HTTPS configurado com sucesso!"
echo " Acesse: https://${DOMAIN}"
echo "============================================================"
echo ""
echo " Agora reconstrua os containers com a nova URL:"
echo " su - projeto"
echo " docker compose -f /opt/linkmebr/docker-compose.prod.yml up -d --build"
echo "============================================================"
