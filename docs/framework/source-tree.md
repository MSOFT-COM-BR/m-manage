# Source Tree — m-manage

> **Sistema:** `m-manage` (Central Hub de Aplicações e Microsserviços MirandaSoft / M-Platform)  
> **Versão de Referência:** V0.10.56  
> **Arquitetura:** Clean Architecture (Hexagonal / Ports & Adapters) + Modular Monolith  
> **Status:** Topologia Oficial do Repositório  

---

## 1. Topologia da Árvore de Diretórios

```
m-manage/
├── src/
│   ├── index.ts                         # Entry point primário (Bun HTTP Engine + Hub Mount)
│   ├── app.ts                           # Instância de aplicação Elysia para testes e inicialização
│   │
│   ├── hub/                             # HUB CENTRAL & SERVICE DISCOVERY ENGINE
│   │   ├── index.ts                     # Barrel export do Hub
│   │   ├── hub.types.ts                 # Interfaces e contratos do Registry, Manifesto e Health
│   │   ├── hub.registry.ts              # Registry singleton para descoberta dinâmica de serviços
│   │   ├── hub.controller.ts            # Elysia Controller (/hub, /hub/manifest, /hub/health)
│   │   └── domain/                      # Camada de Domínio Corporativo do Hub
│   │       ├── entities/                # Entidades e Agregados
│   │       │   └── appService.entity.ts # Entidade de Serviço Vertical do Hub
│   │       ├── valueObjects/            # Value Objects com invariantes imutáveis
│   │       │   ├── semanticVersion.vo.ts# VO de Versão Semântica (SemVer)
│   │       │   └── serviceStatus.vo.ts  # VO de Status Operacional ('active', 'degraded', etc.)
│   │       ├── errors/                  # Exceções de Domínio especializadas
│   │       │   └── hub.errors.ts        # Erros de validação e conflito do Hub
│   │       └── repositories/            # Contratos e Ports abstratos de persistência
│   │
│   ├── modules/                         # BOUNDED CONTEXTS & DOMÍNIOS DE NEGÓCIO
│   │   ├── index.ts                     # Barrel export unificado dos módulos e aggregators
│   │   │
│   │   ├── platform.hub.ts              # Hub Aggregator: Domínio Platform & Core
│   │   ├── ecosystem.hub.ts             # Hub Aggregator: Domínio Ecosystem & Licensing
│   │   ├── businessEduFashion.hub.ts    # Hub Aggregator: Verticais Educação (LMS) e Moda (BVA)
│   │   ├── businessOperations.hub.ts    # Hub Aggregator: Verticais ERP, HealthTech e Restaurante
│   │   │
│   │   ├── adminClients/                # Gestão Administrativa de Clientes MSoft (PF/PJ)
│   │   ├── apps/                        # Marketplace de apps, licenciamento e governança RBAC
│   │   ├── auth/                        # Autenticação centralizada, usuários, JWT e auditoria
│   │   ├── blogs/                       # Artigos, categorias editoriais e cache Redis
│   │   ├── bva/                         # Studio BVA (pedidos, catálogo, consultoras, prospects)
│   │   ├── catalog/                     # Catálogo público e gestão de planos/aplicações
│   │   ├── clientForms/                 # Consumidor AMQP RabbitMQ de formulários externos
│   │   ├── content/                     # Gerenciamento de conteúdo CMS estruturado
│   │   ├── credentials/                 # API Keys e credenciais de integração por cliente
│   │   ├── erp/                         # ERP Manufatura, insumos e kardex multi-app (S002)
│   │   ├── erpFinance/                  # ERP Financeiro multi-tenant, contas e conciliação
│   │   ├── healthtech/                  # Farmácia de Manipulação 4.0 (fórmulas, pacientes)
│   │   ├── logs/                        # Logs de auditoria estruturados do sistema
│   │   ├── mCursos/                     # Plataforma LMS corporativa (cursos, módulos, progresso)
│   │   ├── mLeadsRequest/               # Ingestão de leads comerciais e solicitações
│   │   ├── mjson/                       # Armazenamento JSON dinâmico autenticado
│   │   ├── products/                    # Produtos unificados do ecossistema (S001)
│   │   ├── restaurant/                  # Gestão gastronômica, comandas, mesas e estoque (S021)
│   │   └── tasks/                       # Agendador de tarefas e workers em background
│   │
│   ├── models/                          # ESQUEMAS MONGOOSE & MODELOS DE PERSISTÊNCIA
│   │   ├── mAuth.ts                     # Usuários e credenciais de acesso
│   │   ├── mApps.ts                     # Registro de aplicações instaladas e licenças
│   │   ├── mCatalog.ts                  # Catálogo de produtos/serviços corporativos
│   │   ├── mProduct.ts                  # Produtos unificados multi-app (S001)
│   │   ├── mErp.ts                      # ERP insumos/produtos/kardex (S002)
│   │   ├── mLogs.ts                     # Logs e trilha de auditoria
│   │   ├── mTask.ts                     # Tarefas concorrentes
│   │   ├── mJson.ts                     # Armazenamento key-value flexível
│   │   ├── mBlogs.ts                    # Posts editoriais
│   │   ├── mBlogCategory.ts             # Categorias editoriais
│   │   ├── mContent.ts                  # Conteúdo dinâmico CMS
│   │   ├── mCredential.ts               # Credenciais de integração
│   │   ├── mLeads.ts                    # Leads e prospecção
│   │   ├── mSoftClient.ts               # Cadastro de clientes MirandaSoft (PF/PJ)
│   │   ├── mRestaurantMenuCategory.ts   # Categorias do cardápio (S021)
│   │   ├── mRestaurantMenuItem.ts       # Itens do cardápio (S021)
│   │   ├── mRestaurantIngredient.ts     # Ingredientes e estoque gastronômico (S021)
│   │   ├── mRestaurantTable.ts          # Mesas e ocupação (S021)
│   │   ├── mRestaurantOrder.ts          # Comandas e pedidos gastronômicos (S021)
│   │   ├── mBvaCatalogAccess.ts         # Estatísticas de visualização de catálogo BVA
│   │   ├── mBvaCategoria.ts             # Categorias de produtos BVA
│   │   ├── mBvaOrder.ts                 # Pedidos e transações Studio BVA
│   │   ├── mBvaProspect.ts              # Leads e consultoras Studio BVA
│   │   └── healthtech/                  # Modelos da vertical Farmácia 4.0
│   │
│   ├── config/                          # CONFIGURAÇÃO DE RUNTIME E INFRAESTRUTURA
│   │   ├── mongo.ts                     # Inicializador de conexão MongoDB (Mongoose)
│   │   ├── redis.ts                     # Cliente Redis e cache wrapper tolerante a falhas
│   │   ├── s3.ts                        # Cliente AWS S3 / MinIO para armazenamento de objetos
│   │   ├── jwt.ts                       # Assinatura e verificação de tokens JWT
│   │   └── database.ts                  # Singleton de status de conexão com banco
│   │
│   ├── middleware/                      # MIDDLEWARES TRANSVERSAIS & SEGURANÇA
│   │   ├── requireAuth.ts               # Guard de autenticação obrigatória via JWT
│   │   ├── requireAppAccess.ts          # Guard RBAC de permissão por aplicação (mAppAccess)
│   │   └── tenantPlugin.ts              # Identificação e injeção do contexto multi-tenant
│   │
│   ├── services/                        # SERVIÇOS TÉCNICOS & INFRAESTRUTURA COMPARTILHADA
│   │   ├── rabbitmq.service.ts          # Gerenciamento de conexão e canais AMQP (RabbitMQ)
│   │   ├── uploadService.ts             # Presign de URLs e streaming de arquivos no S3
│   │   ├── backup.service.ts            # Backup assíncrono para Cassandra (fire-and-forget)
│   │   └── erpPricing.ts                # Regras de cálculo e precificação para ERP
│   │
│   ├── routes/                          # CAMADA DE RE-EXPORT (COMPATIBILIDADE LEGADA)
│   ├── types/                           # DEFINIÇÕES DE TIPOS GLOBAIS TYPESCRIPT
│   └── scripts/                         # SCRIPTS DE SEED E MIGRAÇÃO DE DADOS
│
├── docs/                                # DOCUMENTAÇÃO TÉCNICA E ARQUITETURAL
│   ├── architecture/                    # ESPECIFICAÇÕES DE ENGENHARIA DE SOFTWARE
│   │   ├── hub-clean-architecture-spec.md      # Especificação Arquitetural Global do Hub
│   │   ├── clean-architecture-layers-guide.md  # Guia Completo das 4 Camadas da Clean Architecture
│   │   └── client-form-broker.md               # Especificação do Broker de Mensageria
│   ├── framework/                       # GUIAS DE PADRÕES E TECNOLOGIA
│   │   ├── source-tree.md               # Este documento (Topologia de Arquivos)
│   │   ├── coding-standards.md          # Diretrizes e convenções de código
│   │   └── tech-stack.md                # Stack tecnológico e decisões de infraestrutura
│   ├── stories/                         # HISTÓRIAS DE DESENVOLVIMENTO (SDD AIOX)
│   └── qa/                              # RELATÓRIOS E MATRIZES DE QA
│
├── tests/                               # SUÍTE DE TESTES AUTOMATIZADOS (BUN TEST)
├── package.json                         # Dependências e scripts do projeto (V0.10.56)
└── tsconfig.json                        # Configuração do compilador TypeScript
```

---

## 2. Anatomia Padrão de Bounded Context (Clean Architecture)

Cada vertical ou módulo dentro de `src/modules/<contexto>/` adota a seguinte anatomia padrão com 4 camadas concêntricas:

```
src/modules/<contexto>/
├── domain/                              # CAMADA 1: NÚCLEO PURO DE NEGÓCIO
│   ├── entities/                        # Entidades e Agregados com regras invariantes
│   ├── valueObjects/                    # Objetos de Valor imutáveis e auto-validados
│   ├── repositories/                    # Interfaces de Repositório (Ports de saída)
│   └── errors/                          # Exceções de Domínio especializadas
│
├── application/                         # CAMADA 2: CASOS DE USO E ORQUESTRAÇÃO
│   ├── useCases/                        # Interactors (1 classe/função por caso de uso)
│   ├── dtos/                            # Application DTOs (contratos de entrada/saída)
│   └── services/                        # Serviços de aplicação entre múltiplos agregados
│
└── infrastructure/                      # CAMADAS 3 & 4: ADAPTADORES E FRAMEWORKS
    ├── persistence/                     # Schemas Mongoose e Implementações de Repositório
    │   ├── <entidade>.schema.ts
    │   └── mongo.<entidade>.repository.ts
    ├── http/                            # Controllers Elysia e Schemas de validação TypeBox
    │   ├── <contexto>.controller.ts
    │   └── <contexto>.schema.ts
    └── consumers/                       # Consumidores de eventos RabbitMQ (quando aplicável)
```

---

## 3. Endpoints Ativos e Hub Mount Points

### 3.1. Hub Core & Service Discovery
| Método | Endpoint | Controller | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/hub` | `hubRoutes` | Atalho raiz para o manifesto de serviços do Hub |
| `GET` | `/hub/manifest` | `hubRoutes` | Retorna o manifesto completo com árvore de domínios e serviços ativos |
| `GET` | `/hub/health` | `hubRoutes` | Relatório consolidado de integridade da infraestrutura e dos domínios |
| `GET` | `/health` | `app` | Health check básico de infraestrutura (uptime, timestamp) |
| `GET` | `/uploads/*` | `app` | Servidor de mídia S3 com redirecionamento presignado |

### 3.2. Domínio Platform & Core (`platformDomainRoutes`)
| Prefixo | Módulo | Descrição |
| :--- | :--- | :--- |
| `/auth` | `authRoutes` | Autenticação centralizada, registro de usuário e tokens JWT |
| `/credentials` | `credentialRoutes` | Gestão de chaves de API e credenciais por usuário |
| `/admin/clients` | `adminClientRoutes` | Cadastro e administração de clientes MSoft (PF/PJ) |
| `/logs` | `logRoutes` | Consulta a logs estruturados de auditoria |
| `/tasks` | `taskRoutes` | Agendamento, consulta e status de tarefas em background |

### 3.3. Domínio Ecosystem & Licensing (`ecosystemDomainRoutes`)
| Prefixo | Módulo | Descrição |
| :--- | :--- | :--- |
| `/catalog` | `catalogRoutes` | Catálogo de aplicações, planos e marketplace corporativo |
| `/apps` | `appRoutes` | Gestão de aplicações instaladas e RBAC granular (`mAppAccess`) |
| `/leads` | `mLeadsRequestRoutes` | Recepção e gestão de leads comerciais |
| `/content` | `contentRoutes` | Gestor de conteúdo institucional dinâmico (CMS) |
| `/blogs` | `blogRoutes` | Blog corporativo com artigos e cache inteligente no Redis |
| `/mjson` | `mjsonRoutes` | Armazenamento de metadados JSON flexíveis |

### 3.4. Domínio Business Verticals: Educação & Moda (`businessEduFashionRoutes`)
| Prefixo | Módulo | Descrição |
| :--- | :--- | :--- |
| `/m-cursos` | `mCursosRoutes` | Plataforma LMS: cursos, módulos, lições e progresso |
| `/bva/orders` | `bvaOrderRoutes` | Gestão de pedidos e vendas no Studio BVA |
| `/bva/prospects` | `bvaProspectRoutes` | Captação e gestão de consultoras/prospects BVA |
| `/bva/categorias` | `bvaCategoriaRoutes` | Categorização de produtos e catálogo BVA |
| `/bva/catalog-access`| `bvaCatalogAccessRoutes`| Registro e telemetria de acessos ao catálogo BVA |
| `/bva/consultoras` | `consultorasRoutes` | Área exclusiva de consultoras e revendedoras |

### 3.5. Domínio Business Verticals: Operações & SaaS (`businessOperationsRoutes`)
| Prefixo | Módulo | Descrição |
| :--- | :--- | :--- |
| `/erp` | `erpRoutes` | ERP Manufatura, kardex, matérias-primas e insumos (S002) |
| `/erp-finance` | `erpFinanceRoutes` | ERP Gestão Financeira, fluxo de caixa e conciliação bancária |
| `/healthtech` | `healthtechRoutes` | Farmácia de Manipulação 4.0: receitas, fórmulas e prescritores |
| `/products` | `productRoutes` | Catálogo unificado de especificações de produtos (S001) |
| `/restaurant` | `restaurantRoutes` | Gestão gastronômica: comandas, cardápio, mesas e estoque (S021) |
