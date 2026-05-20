# Especificação do Portal — Gestão de Qualidade de Grãos em Silos

## 1. Visão Geral do Sistema

O sistema tem como objetivo central a gestão da qualidade de grãos de soja armazenados em silos, utilizando sensores internos (temperatura, umidade e CO₂) e inteligência artificial para detecção de anomalias e proposição de ações corretivas. A maior parte da coleta e processamento de dados ocorre em equipamentos instalados no local do silo; o portal web é a interface de gestão, monitoramento e comunicação.

O sistema é **multi-tenant**: cada empresa cliente acessa exclusivamente seus próprios dados, silos e usuários. Nenhuma empresa tem visibilidade sobre os dados de outra.

---

## 2. Stack Tecnológico

### 2.1 Backend

| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | LTS | Runtime |
| TypeScript | 5.3 | Linguagem |
| Express.js | 4.18 | Framework HTTP |
| Prisma | 5.10 | ORM |
| PostgreSQL | — | Banco de dados (schema `silos`) |
| Redis | 7 | Cache de sessões e consultas meteorológicas |
| jsonwebtoken | 9.0 | Geração e validação de JWT |
| Zod | 3.22 | Validação de entrada |
| bcrypt | 6.0 | Hash de senhas |
| Helmet | 7.1 | Headers de segurança HTTP |
| express-rate-limit | 7.1 | Rate limiting (login e formulário de contato) |
| swagger-ui-express | 5.0 | Documentação da API REST |

### 2.2 Frontend

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18.2 | UI |
| TypeScript | 5.3 | Linguagem |
| Vite | 5.0 | Build tool |
| React Router DOM | 6.21 | Roteamento SPA e rotas protegidas por perfil |
| Tailwind CSS | 3.4 | Estilização responsiva |
| Axios | 1.6 | HTTP client — APIs internas e API meteorológica |
| React Hook Form | 7.49 | Gerenciamento de formulários |
| React Hot Toast | 2.4 | Notificações de feedback ao usuário |
| Lucide React | 0.312 | Ícones |
| React Leaflet + Leaflet.js | — | Mapa geográfico interativo dos silos (Módulo 3) |
| Recharts | — | Gráficos de linha do histórico de leituras (Módulo 6) |
| PapaParse | — | Geração e exportação de arquivos CSV (Módulo 6) |
| Headless UI ou Radix UI | — | Accordion do FAQ, modais e dropdowns (Módulos 1 e 7) |
| @dnd-kit/core | — | Drag-and-drop para reordenação do FAQ (Módulo 7) |
| react-i18next | — | Internacionalização da interface (pt-BR, en, es) |
| i18next | — | Core da biblioteca de i18n |

### 2.3 API Externa

| Serviço | Uso |
|---|---|
| Open-Meteo API | Dados meteorológicos (temperatura, umidade, condição do tempo) para o dia atual e os dois dias seguintes, obtidos a partir das coordenadas geográficas do silo. Gratuita, sem necessidade de chave de API. |

### 2.4 Infraestrutura

| Item | Valor |
|---|---|
| Provedor | Digital Ocean — App Platform |
| Tipo de recurso | Web Service (Node.js) |
| Instância | 1 GB RAM / 1 vCPU compartilhado / 150 GB bandwidth |
| Containers | 2 |
| Porta HTTP pública | 8080 |
| Build strategy | Buildpack |
| Auto-deploy | Habilitado no push para branch `main` |
| Repositório | GitHub — branch `main` |
| Frontend | Static Site no Digital Ocean App Platform (build Vite) |

#### Variáveis de ambiente obrigatórias

| Variável | Uso |
|---|---|
| `DATABASE_URL` | String de conexão PostgreSQL (`postgresql://usuario:senha@host:porta/banco?sslmode=require`) |
| `REDIS_URL` | String de conexão Redis |
| `JWT_SECRET` | Chave secreta para assinatura dos tokens JWT |
| `JWT_EXPIRES_IN` | Tempo de expiração do token (ex: `8h`) |
| `PORT` | Porta da aplicação — deve ser `8080` |
| `NODE_ENV` | `production` |

#### Comandos de build e execução

| Comando | Valor |
|---|---|
| Build | `npm install && npx prisma generate && npm run build` |
| Run | `npm run start` |

#### Conexão com o banco de dados (Digital Ocean Managed Database)

```
host:     dbaas-db-4648706-do-user-37224602-0.l.db.ondigitalocean.com
porta:    25060
banco:    defaultdb
usuario:  doadmin
sslmode:  require
```

> ⚠️ Nunca versionar credenciais. Configurar via variáveis de ambiente no painel do Digital Ocean. O arquivo `.env` deve estar listado no `.gitignore`.

---

## 3. Convenções do Banco de Dados

- Todas as tabelas e campos em **português**, sem acentos, em snake_case.
- Todas as tabelas criadas no schema **`silos`**.
- Referências entre tabelas devem incluir o schema explicitamente (ex: `silos.sensores`, `silos.leituras`).

---

## 4. Internacionalização (i18n)

O sistema é trilíngue: **português (pt-BR)**, **inglês (en)** e **espanhol (es)**. A estratégia de tradução é dividida em dois tipos de conteúdo.

### 4.1 Textos estáticos da interface

Todos os textos de interface (menus, rótulos, mensagens de erro e sucesso, títulos de seções, textos da landing page) são armazenados em arquivos JSON por idioma, sem nenhum texto hardcoded nos componentes React.

Estrutura de arquivos:

```
src/
  i18n/
    pt-BR.json
    en.json
    es.json
```

Exemplo de estrutura dos arquivos JSON:

```json
{
  "nav": {
    "entrar": "Entrar",
    "faq": "Perguntas frequentes",
    "contato": "Contato"
  },
  "hero": {
    "headline": "Monitoramento inteligente da qualidade de grãos em silos",
    "cta": "Solicitar demonstração"
  },
  "dashboard": {
    "total_silos": "Total de silos",
    "sem_leitura": "Sem leitura disponível"
  },
  "erros": {
    "campo_obrigatorio": "Campo obrigatório",
    "email_invalido": "E-mail inválido"
  }
}
```

Biblioteca: `react-i18next` + `i18next`.

### 4.2 Conteúdo dinâmico (FAQ)

As perguntas e respostas do FAQ são armazenadas com campos separados por idioma na tabela `silos.faq` (ver seção 7.2). O backend retorna apenas os campos do idioma solicitado, determinado pelo parâmetro `?lang=` ou header `Accept-Language`.

Idiomas suportados: `pt`, `en`, `es`. Validação no backend via Zod:

```typescript
const idiomaSchema = z.enum(['pt', 'en', 'es']).default('pt');
```

Exemplo de query com Prisma:

```typescript
const lang = req.query.lang || 'pt';

const faqs = await prisma.faq.findMany({
  where: { status: 'publicado' },
  orderBy: { ordem: 'asc' },
  select: {
    id: true,
    [`pergunta_${lang}`]: true,
    [`resposta_${lang}`]: true,
  }
});
```

O frontend recebe apenas `pergunta` e `resposta` no idioma correto, sem lógica adicional de seleção de campo.

### 4.3 Interface de administração do FAQ

O formulário de cadastro e edição de entradas do FAQ (Módulo 7) exibe os campos organizados por idioma em abas. Todos os campos de todos os idiomas são obrigatórios — não é permitido publicar uma entrada com qualquer idioma incompleto.

```
[ Português ]  [ English ]  [ Español ]

Pergunta: _______________
Resposta: _______________
```

### 4.4 Seletor de idioma

Um seletor de idioma visível na navbar da landing page e no painel interno permite ao usuário alternar entre os idiomas disponíveis. A preferência é persistida no `localStorage` do navegador.

```
🌐  PT | EN | ES
```

### 4.5 Resumo da estratégia

| Tipo de conteúdo | Abordagem |
|---|---|
| Textos estáticos da interface | Arquivos JSON por idioma via `react-i18next` |
| FAQ (perguntas e respostas) | Campos `_pt`, `_en`, `_es` na tabela `silos.faq` |
| Idioma enviado ao backend | Query param `?lang=` ou header `Accept-Language` |
| Persistência da preferência | `localStorage` no frontend |
| Validação do idioma | Zod enum `['pt', 'en', 'es']` no backend |

---

## 5. Responsividade

O portal é responsivo para **desktop**, **tablet** e **mobile**. O layout se adapta aos três tamanhos de tela. Atenção especial ao dashboard de silos e aos gráficos de relatórios, que são os componentes mais densos visualmente.

---

## 6. Módulos do Sistema

### Módulo 1 — Landing Page

Página pública de apresentação da empresa e do sistema. Ponto de acesso para novos visitantes e para login de usuários cadastrados.

#### Seções

1. **Barra de navegação fixa** — logo, links âncora para as seções da página e botão "Entrar" que abre o formulário de autenticação (e-mail e senha).
2. **Hero** — headline de impacto, subtítulo explicativo sobre a solução (sensores + IA + portal) e CTA principal "Solicitar demonstração" com âncora para o formulário de contato.
3. **Sobre a empresa** — missão, história e diferenciais, com possibilidade de exibir logos de parceiros ou certificações.
4. **Como funciona** — fluxo em 3 passos: (a) sensores no silo capturam dados → (b) IA analisa e detecta anomalias → (c) portal exibe alertas.
5. **Funcionalidades do portal** — cards visuais: dashboard em tempo real, alertas, relatórios históricos, recomendações por IA.
6. **Benefícios e resultados** — métricas de impacto (ex: redução de perdas, conformidade com normas).
7. **FAQ** — accordion expansível com perguntas e respostas carregadas dinamicamente do banco de dados (`silos.faq`). Apenas entradas com status `publicado` são exibidas.
8. **Formulário de contato** — campos: nome, empresa, e-mail, telefone, mensagem. Envio gera registro em `silos.solicitacoes_contato`.
9. **Rodapé** — links úteis, redes sociais, política de privacidade e copyright.

---

### Módulo 2 — Autenticação e Autorização

#### 2.1 Modelo Multi-Tenant

Cada empresa cliente possui um espaço isolado. O isolamento é garantido em todas as camadas (dados, interface e regras de negócio). Nenhum usuário vinculado a uma empresa pode visualizar, acessar ou interferir nos dados de outra.

O **Administrador Geral** é o único perfil não vinculado a nenhuma empresa — opera no nível da plataforma.

#### 2.2 Perfis de Usuário

**Administrador Geral**
- Não está associado a nenhuma empresa cliente.
- CRUD completo de empresas.
- Cria e gerencia usuários com perfil de Administrador Geral.
- Cria o primeiro Administrador de Empresa após o cadastro de uma nova empresa.
- Administra o formulário de contato e a tabela de FAQ.
- **Restrição:** não pode criar usuários com perfil de Operador de Empresa.

**Administrador de Empresa**
- Vinculado obrigatoriamente a uma empresa específica.
- Gerencia os silos da sua empresa (criação, edição, desativação).
- Cria e gerencia usuários da sua empresa (perfis Administrador de Empresa e Operador de Empresa).
- **Restrição:** não pode criar Administradores Gerais nem gerenciar outras empresas.

**Operador de Empresa**
- Vinculado obrigatoriamente a uma empresa específica.
- Consulta informações dos silos da sua empresa: leituras, histórico e alertas.
- **Restrição:** acesso somente leitura. Não pode criar ou editar silos, sensores ou usuários.

#### 2.3 Matriz de Permissões

| Ação | Adm. Geral | Adm. Empresa | Operador |
|---|---|---|---|
| CRUD de empresas | ✅ | ❌ | ❌ |
| Criar Adm. Geral | ✅ | ❌ | ❌ |
| Criar Adm. Empresa | ✅ | ✅ (própria empresa) | ❌ |
| Criar Operador | ❌ | ✅ (própria empresa) | ❌ |
| CRUD de silos | ❌ | ✅ (própria empresa) | ❌ |
| CRUD de barras | ❌ | ✅ (própria empresa) | ❌ |
| CRUD de sensores | ❌ | ✅ (própria empresa) | ❌ |
| Visualizar silos/barras/sensores | ❌ | ✅ (própria empresa) | ✅ (própria empresa) |
| Gerenciar FAQ | ✅ | ❌ | ❌ |
| Gerenciar formulário de contato | ✅ | ❌ | ❌ |

#### 2.4 Fluxo de Autenticação

- Login por **e-mail e senha** para todos os perfis, acessado pelo botão "Entrar" na navbar da landing page.
- Após autenticação, o sistema identifica o perfil e redireciona para o painel correspondente.
- O Administrador Geral deve selecionar uma empresa antes de visualizar silos.
- Sessões expiram após período de inatividade configurável via `JWT_EXPIRES_IN`.
- Recuperação de senha e notificações por e-mail **não estão no escopo desta versão**.
- A senha inicial do usuário é definida pelo Administrador no momento do cadastro.

#### 2.5 Segurança

- Senhas armazenadas com hash bcrypt.
- Todas as rotas do portal interno protegidas por autenticação JWT.
- Controle de acesso aplicado no backend — a interface não é a única barreira.
- Rate limiting na rota de login (proteção contra força bruta).
- Headers de segurança HTTP via Helmet.
- Logs de acesso e ações administrativas para auditoria.

---

### Módulo 3 — Painel Interno (Dashboard)

#### 3.1 Visão Geral

Tela principal após o login. Organizada em dois níveis: **visão geral** (todos os silos da empresa) e **tela de detalhe** de cada silo.

**Acesso:** todos os perfis. O Administrador Geral seleciona a empresa antes de visualizar os silos.

#### 3.2 Visão Geral — Lista de Silos

**Mapa geográfico interativo**
- Marcadores na posição lat/long de cada silo ativo.
- Marcadores coloridos por status: verde (normal) e vermelho (alerta ativo).
- Clique no marcador abre o detalhe do silo.
- Biblioteca: React Leaflet + Leaflet.js.

**Painel de resumo**
- Total de silos da empresa.
- Quantidade de silos em status normal.
- Quantidade de silos com alerta ativo.

**Cards de silos**
Cada card exibe: identificador, nome, cidade/estado, quantidade de barras, quantidade de sensores e indicador visual de status (normal ou alerta com descrição).

#### 3.3 Tela de Detalhe do Silo

**Identificação do silo**
- Identificador numérico, nome, endereço completo, coordenadas geográficas, quantidade de barras, quantidade de sensores e status geral.

**Condições meteorológicas**
- Dados obtidos via Open-Meteo API usando as coordenadas lat/long do silo.
- Exibe: dia atual e dois dias seguintes — temperatura máx/mín, umidade relativa e condição geral.
- Dados meteorológicos não são armazenados no banco de dados.
- Cache no Redis para evitar chamadas repetidas à API externa.

**Leituras dos sensores**
- Organizadas por barra de instalação.
- Cada sensor exibe: identificação, tipo de grandeza, altura em relação ao solo, valor médio da leitura mais recente e unidade de medida.
- Sensores com leitura em alerta destacados em vermelho.
- Data e hora da última leitura exibida no topo da seção.

#### 3.4 Regras de Negócio

- Silos desativados não aparecem no painel.
- Sensores desativados não aparecem na tela de detalhe.
- Se não houver leitura para um sensor, exibir "Sem leitura disponível".
- Alertas são determinados pela tabela `silos.alertas` vinculada ao silo.

---

### Módulo 4 — Gestão de Silos e Sensores

#### 4.1 Visão Geral

Cadastro hierárquico: **Empresa → Silo → Barra → Sensor**. Gerenciamento exclusivo do Administrador de Empresa, restrito à sua própria empresa.

#### 4.2 Cadastro de Silos

O identificador numérico do silo é gerado automaticamente pelo sistema e não é editável.

| Campo | Descrição |
|---|---|
| Nome | Nome de identificação do silo |
| Logradouro | Rua, rodovia ou estrada + km/numeração |
| Bairro | Bairro ou localidade |
| Cidade | Município |
| Estado | Unidade federativa |
| Latitude | Coordenada geográfica decimal |
| Longitude | Coordenada geográfica decimal |
| Descricao | Campo texto livre para características do silo |

A localização geográfica pode ser preenchida manualmente ou por seleção em mapa interativo.

#### 4.3 Cadastro de Barras

Cada silo pode ter uma ou mais barras de instalação.

| Campo | Descrição |
|---|---|
| Identificacao | Código ou nome da barra (ex: "Barra A", "B-01") |
| Silo vinculado | FK para o silo ao qual a barra pertence |

#### 4.4 Cadastro de Sensores

Cada barra pode conter sensores de qualquer tipo de grandeza (tipos mistos permitidos na mesma barra).

| Campo | Descrição |
|---|---|
| Identificacao | Código ou nome do sensor (ex: "S-001") |
| Barra vinculada | FK para a barra onde o sensor está instalado |
| Altura em relação ao solo | Valor numérico em metros |
| Tipo de grandeza | Temperatura, Umidade ou CO₂ |
| Unidade de medida | °C, % ou ppm (preenchida automaticamente pelo tipo) |

#### 4.5 Regras de Negócio

- Identificador do silo gerado pelo sistema, não editável.
- Silo só pode ser cadastrado se vinculado a uma empresa ativa.
- Exclusão de silo bloqueada se existirem barras, sensores ou leituras associadas.
- Exclusão de barra bloqueada se existirem sensores associados.
- Operador de Empresa tem acesso somente leitura neste módulo.
- Desativação de silo ou sensor preserva o histórico de leituras.

---

### Módulo 6 — Relatórios e Histórico

#### 6.1 Visão Geral

Consulta ao histórico de leituras dos sensores de um silo em período definido. Dados apresentados simultaneamente em gráfico de linha e tabela de valores, com exportação para CSV.

**Acesso:** Administrador de Empresa e Operador de Empresa (própria empresa). Administrador Geral após selecionar empresa.

#### 6.2 Filtros de Consulta

| Filtro | Descrição |
|---|---|
| Silo | Obrigatório. Lista os silos ativos da empresa |
| Barra | Opcional. Padrão: todas |
| Sensor | Opcional. Padrão: todos |
| Data inicial | Início do período |
| Data final | Fim do período |

- Seleção de barra habilitada após seleção do silo.
- Seleção de sensor habilitada após seleção da barra.
- Data final não pode ser anterior à data inicial.

#### 6.3 Gráfico de Linha

- Eixo X: data e hora das leituras.
- Eixo Y: valor da medida na unidade correspondente.
- Cada sensor representado por uma linha de cor distinta com legenda (código + altura).
- Sensores de tipos de grandeza diferentes exibidos em subgráficos separados (escalas incompatíveis).
- Biblioteca: Recharts.

#### 6.4 Tabela de Leituras

| Coluna | Descrição |
|---|---|
| Data/Hora | Timestamp da leitura |
| Barra | Identificação da barra |
| Sensor | Identificação do sensor |
| Grandeza | Tipo de grandeza |
| Valor médio | Média das amostras do ciclo |
| Valor máximo | Máximo do ciclo |
| Valor mínimo | Mínimo do ciclo |
| Amostras | Quantidade de amostras |
| Desvio padrão | Desvio padrão das amostras |
| Unidade | Unidade de medida |

- Tabela paginada.
- Ordenação padrão: data/hora decrescente.
- Reordenação por qualquer coluna.

#### 6.5 Exportação CSV

- Botão "Exportar CSV" gera um único arquivo com todas as leituras do silo no período filtrado.
- A exportação sempre inclui todos os sensores do silo, independentemente dos filtros de barra/sensor aplicados na visualização.
- Nome do arquivo: `silo_{id}_{data_inicial}_{data_final}.csv`.
- Separador decimal: ponto (`.`).
- Biblioteca: PapaParse.

#### 6.6 Regras de Negócio

- Sensores desativados com histórico aparecem nos relatórios, identificados como inativos.
- Silos desativados podem ser consultados no histórico mas não aparecem no seletor do dashboard.

---

### Módulo 7 — Administração

#### 7.1 Gestão de Empresas
*Acesso: Administrador Geral*

CRUD completo das empresas clientes.

| Campo | Descrição |
|---|---|
| Identificador | Gerado automaticamente, não editável |
| Razao_social | Nome jurídico |
| Nome_fantasia | Nome comercial |
| Cnpj | CNPJ da empresa |
| Logradouro | Rua, número |
| Bairro | Bairro |
| Cidade | Município |
| Estado | UF |
| Cep | CEP |
| Telefone | Telefone de contato |
| Email | E-mail de contato |
| Status | Ativa / Inativa |

Regras:
- Desativação bloqueia acesso de todos os usuários da empresa sem excluir dados.
- Exclusão permitida apenas se não houver silos, usuários ou leituras associados.

#### 7.2 Gestão de Usuários
*Acesso: Administrador Geral (perfis Adm. Geral e Adm. Empresa) · Administrador de Empresa (perfis Adm. Empresa e Operador, restritos à própria empresa)*

| Campo | Descrição |
|---|---|
| Identificador | Gerado automaticamente, não editável |
| Nome_completo | Nome do usuário |
| Email | Login; único no sistema |
| Senha | Definida pelo administrador no cadastro; armazenada com hash bcrypt |
| Perfil | Administrador Geral / Administrador de Empresa / Operador de Empresa |
| Empresa vinculada | Obrigatório para Adm. Empresa e Operador; não aplicável ao Adm. Geral |
| Status | Ativo / Inativo |

Regras:
- E-mail não pode ser alterado após o cadastro.
- Usuário não pode excluir a si próprio.
- Desativação encerra imediatamente as sessões ativas do usuário.

#### 7.3 Gestão de FAQ
*Acesso: Administrador Geral*

| Campo | Descrição |
|---|---|
| Identificador | Gerado automaticamente, não editável |
| Pergunta | Texto exibido no accordion |
| Resposta | Texto da resposta com suporte a formatação básica |
| Ordem | Número inteiro de ordenação |
| Status | Publicado / Rascunho |

Regras:
- Apenas entradas com status `Publicado` são exibidas na landing page.
- Reordenação por drag-and-drop (@dnd-kit/core) ou edição manual do número de ordem.

#### 7.4 Gestão de Solicitações de Contato
*Acesso: Administrador Geral*

Visualização e gestão das solicitações recebidas pelo formulário da landing page. Não há criação manual de registros.

| Campo | Descrição |
|---|---|
| Identificador | Gerado automaticamente |
| Nome | Nome do solicitante |
| Empresa | Empresa informada |
| Email | E-mail de contato |
| Telefone | Telefone informado |
| Mensagem | Texto livre |
| Data_hora | Timestamp automático do envio |
| Status | Novo / Em atendimento / Concluído |
| Observacoes_internas | Anotações da equipe |

Regras:
- Status inicial de toda solicitação: `Novo`.
- Registros com status `Concluído` não podem ser excluídos, apenas arquivados.

---

## 7. Modelo de Dados

### 7.1 Diagrama de Entidades

```
silos.empresas
    └── silos.usuarios
    └── silos.silos
            └── silos.barras
                    └── silos.sensores
                            └── silos.leituras
            └── silos.alertas

silos.faq
silos.solicitacoes_contato
```

### 7.2 Definição das Tabelas

```sql
-- Empresas clientes
CREATE TABLE silos.empresas (
  id              SERIAL PRIMARY KEY,
  razao_social    VARCHAR(200) NOT NULL,
  nome_fantasia   VARCHAR(200),
  cnpj            VARCHAR(18) UNIQUE NOT NULL,
  logradouro      VARCHAR(300),
  bairro          VARCHAR(100),
  cidade          VARCHAR(100),
  estado          CHAR(2),
  cep             VARCHAR(10),
  telefone        VARCHAR(20),
  email           VARCHAR(200),
  status          VARCHAR(10) NOT NULL DEFAULT 'ativa'
                  CHECK (status IN ('ativa', 'inativa')),
  criado_em       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usuários do sistema
CREATE TABLE silos.usuarios (
  id              SERIAL PRIMARY KEY,
  nome_completo   VARCHAR(200) NOT NULL,
  email           VARCHAR(200) UNIQUE NOT NULL,
  senha_hash      VARCHAR(255) NOT NULL,
  perfil          VARCHAR(30) NOT NULL
                  CHECK (perfil IN ('administrador_geral', 'administrador_empresa', 'operador_empresa')),
  empresa_id      INTEGER REFERENCES silos.empresas(id),
  status          VARCHAR(10) NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'inativo')),
  criado_em       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Silos de armazenamento
CREATE TABLE silos.silos (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES silos.empresas(id),
  nome            VARCHAR(200) NOT NULL,
  logradouro      VARCHAR(300),
  bairro          VARCHAR(100),
  cidade          VARCHAR(100),
  estado          CHAR(2),
  latitude        DECIMAL(10,7),
  longitude       DECIMAL(10,7),
  descricao       TEXT,
  status          VARCHAR(10) NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'inativo')),
  criado_em       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Barras de instalação de sensores
CREATE TABLE silos.barras (
  id              SERIAL PRIMARY KEY,
  silo_id         INTEGER NOT NULL REFERENCES silos.silos(id),
  identificacao   VARCHAR(100) NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'ativa'
                  CHECK (status IN ('ativa', 'inativa')),
  criado_em       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sensores instalados nas barras
CREATE TABLE silos.sensores (
  id              SERIAL PRIMARY KEY,
  barra_id        INTEGER NOT NULL REFERENCES silos.barras(id),
  identificacao   VARCHAR(100) NOT NULL,
  altura_solo_m   DECIMAL(6,2) NOT NULL,
  tipo_grandeza   VARCHAR(20) NOT NULL
                  CHECK (tipo_grandeza IN ('temperatura', 'umidade', 'co2')),
  unidade_medida  VARCHAR(10) NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'inativo')),
  criado_em       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leituras dos sensores
CREATE TABLE silos.leituras (
  id              BIGSERIAL PRIMARY KEY,
  sensor_id       INTEGER NOT NULL REFERENCES silos.sensores(id),
  timestamp       TIMESTAMP WITH TIME ZONE NOT NULL,
  valor_avg       DECIMAL(10,4) NOT NULL,
  valor_max       DECIMAL(10,4) NOT NULL,
  valor_min       DECIMAL(10,4) NOT NULL,
  num_amostras    INTEGER NOT NULL,
  desvio_padrao   DECIMAL(10,4)
);

CREATE INDEX idx_leituras_sensor_timestamp
  ON silos.leituras(sensor_id, timestamp DESC);

CREATE INDEX idx_leituras_timestamp
  ON silos.leituras(timestamp DESC);

-- Alertas por silo
CREATE TABLE silos.alertas (
  id              SERIAL PRIMARY KEY,
  silo_id         INTEGER NOT NULL REFERENCES silos.silos(id),
  descricao       TEXT NOT NULL,
  criado_em       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FAQ da landing page (trilíngue)
CREATE TABLE silos.faq (
  id              SERIAL PRIMARY KEY,
  pergunta_pt     TEXT NOT NULL,
  pergunta_en     TEXT NOT NULL,
  pergunta_es     TEXT NOT NULL,
  resposta_pt     TEXT NOT NULL,
  resposta_en     TEXT NOT NULL,
  resposta_es     TEXT NOT NULL,
  ordem           INTEGER NOT NULL DEFAULT 0,
  status          VARCHAR(15) NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('publicado', 'rascunho')),
  criado_em       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Solicitações de contato da landing page
CREATE TABLE silos.solicitacoes_contato (
  id                    SERIAL PRIMARY KEY,
  nome                  VARCHAR(200) NOT NULL,
  empresa               VARCHAR(200),
  email                 VARCHAR(200) NOT NULL,
  telefone              VARCHAR(20),
  mensagem              TEXT NOT NULL,
  data_hora             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status                VARCHAR(20) NOT NULL DEFAULT 'novo'
                        CHECK (status IN ('novo', 'em_atendimento', 'concluido')),
  observacoes_internas  TEXT
);
```

### 7.3 Estimativa de Volume de Dados

O equipamento transmite leituras aproximadamente a cada **3 minutos** (~480 leituras/dia por sensor).

| Escala | Leituras/dia | Leituras/ano |
|---|---|---|
| 1 empresa · 5 silos · 2 barras · 3 sensores | 144.000 | ~53 milhões |
| 1 empresa · 10 silos · 3 barras · 3 sensores | 432.000 | ~158 milhões |

Recomenda-se definir política de retenção e arquivamento antes da implantação em produção.

---

## 8. Escopo desta Versão — Funcionalidades Excluídas

As seguintes funcionalidades foram explicitamente excluídas do escopo desta versão:

| Funcionalidade | Motivo |
|---|---|
| Recuperação de senha por e-mail | Sem provedor de e-mail nesta versão |
| Notificação de novo usuário por e-mail | Sem provedor de e-mail nesta versão |
| Notificação de solicitação de contato por e-mail | Sem provedor de e-mail nesta versão |
| Autenticação em dois fatores (2FA) | Prevista para versão futura |
| Alertas e ações corretivas como módulo independente | Gerenciados pelo equipamento local; alertas exibidos no dashboard |
| Limites operacionais por empresa | Sem restrições nesta versão |
