# Portal de Gestão de Qualidade de Grãos em Silos

Sistema multi-tenant para monitoramento de silos de soja via sensores (temperatura, umidade, CO₂) e inteligência artificial.

> Deploy automático via GitHub Actions em Droplet DigitalOcean.
> A cada push em `main`, o workflow `.github/workflows/deploy.yml` conecta ao Droplet via SSH,
> executa `git pull` e sobe os containers com `docker compose -f docker-compose.prod.yml up -d --build`.

## Estrutura

```
linkmebr/
├── backend/   # Node.js + TypeScript + Express + Prisma + PostgreSQL + Redis
└── frontend/  # React 18 + TypeScript + Vite + Tailwind CSS
```

## Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Variáveis de Ambiente

Veja `backend/.env.example` para todas as variáveis necessárias.

---

## Docker

### Desenvolvimento (infra local, apps fora do Docker)

Sobe apenas PostgreSQL e Redis:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Configure `backend/.env`:
```
DATABASE_URL=postgresql://linkmebr:linkmebr_dev@localhost:5432/linkmebr?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=troque_por_uma_chave_secreta_segura
JWT_EXPIRES_IN=8h
PORT=8080
NODE_ENV=development
```

Depois:
```bash
cd backend && npx prisma migrate dev && npm run prisma:seed && npm run dev
cd frontend && npm run dev
```

### Stack completa com Docker

Sobe backend + frontend + PostgreSQL + Redis em containers:

```bash
# 1. Crie backend/.env com JWT_SECRET (DATABASE_URL e REDIS_URL são sobrescritos pelo compose)
cp backend/.env.example backend/.env
# Edite backend/.env e defina JWT_SECRET

# 2. Suba tudo
docker compose up -d --build

# 3. Rode as migrations (uma única vez)
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx ts-node prisma/seed.ts
```

Acesso:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080/api/v1
- Swagger: http://localhost:8080/api-docs

### Build das imagens individualmente

```bash
# Backend
docker build -t linkmebr-backend ./backend

# Frontend (defina a URL da API em build time)
docker build --build-arg VITE_API_URL=https://api.seudominio.com/api/v1 -t linkmebr-frontend ./frontend
```
