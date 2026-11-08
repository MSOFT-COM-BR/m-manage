/**
 * Test Suite: Hub Central - Clean Architecture Layers
 * 
 * Suíte de testes abrangente cobrindo todas as 4 camadas da Clean Architecture do Hub Central:
 * - Camada 1: Domain (Entidades, Value Objects e Erros Invariantes)
 * - Camada 2: Application (Use Cases, DTOs e Portas de Repositório)
 * - Camada 3 & 4: Interface Adapters & HTTP Engine (Elysia Routes e In-Memory Repository)
 * 
 * @version 0.10.56
 * @module HubCleanArchitectureTest
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { Elysia } from 'elysia';

// Camada 1: Domínio
import {
    AppServiceEntity,
    HubManifestEntity,
    ServiceStatus,
    SemanticVersion,
    DomainError,
    InvalidServiceStatusError,
    InvalidSemanticVersionError,
    InvalidServiceConfigError,
    ServiceAlreadyRegisteredError,
    ServiceNotFoundError,
} from '../src/hub/domain';

// Camada 2: Aplicação
import {
    GetHubManifestUseCase,
    CheckHubHealthUseCase,
    RegisterServiceUseCase,
} from '../src/hub/application';

// Camada 3 & 4: Infraestrutura & Adaptadores
import {
    InMemoryHubServiceRepository,
    createHubCleanController,
    hubCleanRoutes,
} from '../src/hub/infrastructure';

describe('Hub Central - Clean Architecture Test Suite (V0.10.56)', () => {

    /* ========================================================================= */
    /* CAMADA 1: DOMÍNIO (Enterprise Business Rules)                             */
    /* ========================================================================= */
    describe('Camada 1: Domínio (Enterprise Business Rules)', () => {

        describe('Value Object: ServiceStatus', () => {
            it('deve instanciar status válidos com sucesso via factory create()', () => {
                const active = ServiceStatus.create('active');
                const inactive = ServiceStatus.create('inactive');
                const degraded = ServiceStatus.create('degraded');
                const maintenance = ServiceStatus.create('maintenance');

                expect(active.value).toBe('active');
                expect(inactive.value).toBe('inactive');
                expect(degraded.value).toBe('degraded');
                expect(maintenance.value).toBe('maintenance');
            });

            it('deve normalizar maiúsculas e espaços em branco automaticamente', () => {
                const status = ServiceStatus.create('  ACTIVE  ');
                expect(status.value).toBe('active');
                expect(status.isActive()).toBe(true);
            });

            it('deve fornecer métodos estáticos de conveniência', () => {
                expect(ServiceStatus.active().value).toBe('active');
                expect(ServiceStatus.inactive().value).toBe('inactive');
                expect(ServiceStatus.degraded().value).toBe('degraded');
                expect(ServiceStatus.maintenance().value).toBe('maintenance');
            });

            it('deve avaliar corretamente os predicados de operacionalidade', () => {
                expect(ServiceStatus.active().isOperational()).toBe(true);
                expect(ServiceStatus.degraded().isOperational()).toBe(true);
                expect(ServiceStatus.inactive().isOperational()).toBe(false);
                expect(ServiceStatus.maintenance().isOperational()).toBe(false);
            });

            it('deve comparar igualdade por valor (Value Object Immutability)', () => {
                const statusA = ServiceStatus.create('active');
                const statusB = ServiceStatus.active();
                const statusC = ServiceStatus.inactive();

                expect(statusA.equals(statusB)).toBe(true);
                expect(statusA.equals(statusC)).toBe(false);
                expect(statusA.equals(null)).toBe(false);
            });

            it('deve lançar InvalidServiceStatusError para valores arbitrários não permitidos', () => {
                expect(() => ServiceStatus.create('unknown_status')).toThrow(InvalidServiceStatusError);
                try {
                    ServiceStatus.create('invalid_status');
                } catch (err: unknown) {
                    expect(err).toBeInstanceOf(DomainError);
                    expect(err).toBeInstanceOf(InvalidServiceStatusError);
                    const error = err as InvalidServiceStatusError;
                    expect(error.code).toBe('INVALID_SERVICE_STATUS');
                }
            });

            it('deve lançar InvalidServiceStatusError para strings vazias', () => {
                expect(() => ServiceStatus.create('')).toThrow(InvalidServiceStatusError);
            });
        });

        describe('Value Object: SemanticVersion', () => {
            it('deve criar versões semânticas válidas no padrão canônico', () => {
                const v = SemanticVersion.create('1.2.3');
                expect(v.major).toBe(1);
                expect(v.minor).toBe(2);
                expect(v.patch).toBe(3);
                expect(v.prerelease).toBeUndefined();
                expect(v.toNormalizedString()).toBe('1.2.3');
            });

            it('deve suportar prefixo "v" e sufixo de pré-lançamento', () => {
                const v = SemanticVersion.create('v0.10.56-beta.1');
                expect(v.major).toBe(0);
                expect(v.minor).toBe(10);
                expect(v.patch).toBe(56);
                expect(v.prerelease).toBe('beta.1');
                expect(v.toNormalizedString()).toBe('0.10.56-beta.1');
            });

            it('deve assumir patch 0 quando omitido (ex: 1.0)', () => {
                const v = SemanticVersion.create('2.5');
                expect(v.major).toBe(2);
                expect(v.minor).toBe(5);
                expect(v.patch).toBe(0);
                expect(v.toNormalizedString()).toBe('2.5.0');
            });

            it('deve validar igualdade e comparação de precedência', () => {
                const v1 = SemanticVersion.create('1.0.0');
                const v2 = SemanticVersion.create('1.0.0');
                const v3 = SemanticVersion.create('2.0.0');

                expect(v1.equals(v2)).toBe(true);
                expect(v1.equals(v3)).toBe(false);
                expect(v3.isGreaterThan(v1)).toBe(true);
                expect(v1.isGreaterThan(v3)).toBe(false);
            });

            it('deve verificar compatibilidade semântica (mesmo Major version)', () => {
                const v10 = SemanticVersion.create('1.0.0');
                const v12 = SemanticVersion.create('1.2.0');
                const v20 = SemanticVersion.create('2.0.0');

                expect(v10.isCompatibleWith(v12)).toBe(true);
                expect(v10.isCompatibleWith(v20)).toBe(false);
            });

            it('deve lançar InvalidSemanticVersionError para formatos inválidos', () => {
                expect(() => SemanticVersion.create('not-a-version')).toThrow(InvalidSemanticVersionError);
                expect(() => SemanticVersion.create('')).toThrow(InvalidSemanticVersionError);
                try {
                    SemanticVersion.create('abc.xyz');
                } catch (err: unknown) {
                    expect(err).toBeInstanceOf(InvalidSemanticVersionError);
                    const error = err as InvalidSemanticVersionError;
                    expect(error.code).toBe('INVALID_SEMANTIC_VERSION');
                }
            });
        });

        describe('Entidade de Domínio: AppServiceEntity', () => {
            it('deve criar uma entidade de serviço com dados consistentes', () => {
                const service = AppServiceEntity.create({
                    key: 'm-com',
                    name: 'M-Comercial & Vendas',
                    prefix: '/api/v1/commercial',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                    description: 'Módulo de vendas e catálogo comercial',
                    tags: ['commercial', 'bva'],
                    metadata: { tenantTier: 'premium' },
                });

                expect(service.key).toBe('m-com');
                expect(service.name).toBe('M-Comercial & Vendas');
                expect(service.prefix).toBe('/api/v1/commercial');
                expect(service.version.toNormalizedString()).toBe('1.0.0');
                expect(service.status.isActive()).toBe(true);
                expect(service.hasTag('commercial')).toBe(true);
                expect(service.hasTag('bva')).toBe(true);
                expect(service.tags).toContain('commercial');
            });

            it('deve normalizar chave para lowercase e remover barra final do prefixo', () => {
                const service = AppServiceEntity.create({
                    key: 'M-ERP-FINANCE',
                    name: 'ERP Finance',
                    prefix: '/erp/finance/',
                    version: SemanticVersion.create('2.0.0'),
                    status: ServiceStatus.active(),
                });

                expect(service.key).toBe('m-erp-finance');
                expect(service.prefix).toBe('/erp/finance');
            });

            it('deve lançar InvalidServiceConfigError se a chave for inválida ou vazia', () => {
                expect(() => AppServiceEntity.create({
                    key: '',
                    name: 'Invalid Service',
                    prefix: '/invalid',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                })).toThrow(InvalidServiceConfigError);

                expect(() => AppServiceEntity.create({
                    key: 'invalid key with spaces!',
                    name: 'Invalid Service',
                    prefix: '/invalid',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                })).toThrow(InvalidServiceConfigError);
            });

            it('deve lançar InvalidServiceConfigError se o prefixo não começar com "/"', () => {
                expect(() => AppServiceEntity.create({
                    key: 'valid-key',
                    name: 'Valid Service',
                    prefix: 'missing-slash-prefix',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                })).toThrow(InvalidServiceConfigError);
            });

            it('deve permitir transições de ciclo de vida mantendo integridade', () => {
                const service = AppServiceEntity.create({
                    key: 'm-tasks',
                    name: 'Tasks Worker',
                    prefix: '/tasks',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });

                service.degrade();
                expect(service.status.isDegraded()).toBe(true);

                service.putInMaintenance();
                expect(service.status.isMaintenance()).toBe(true);

                service.activate();
                expect(service.status.isActive()).toBe(true);

                service.deactivate();
                expect(service.status.isInactive()).toBe(true);
            });

            it('deve serializar fielmente para DTO através de toDTO()', () => {
                const service = AppServiceEntity.create({
                    key: 'm-cursos',
                    name: 'M-Cursos LMS',
                    prefix: '/m-cursos',
                    version: SemanticVersion.create('2.1.0'),
                    status: ServiceStatus.active(),
                    tags: ['education', 'ead'],
                });

                const dto = service.toDTO();
                expect(dto.key).toBe('m-cursos');
                expect(dto.name).toBe('M-Cursos LMS');
                expect(dto.prefix).toBe('/m-cursos');
                expect(dto.version).toBe('2.1.0');
                expect(dto.status).toBe('active');
                expect(dto.tags).toEqual(['education', 'ead']);
                expect(typeof dto.createdAt).toBe('string');
                expect(typeof dto.updatedAt).toBe('string');
            });
        });

        describe('Agregado de Domínio: HubManifestEntity', () => {
            const createBaseManifest = () => HubManifestEntity.create({
                name: 'm-manage-hub',
                version: SemanticVersion.create('0.10.56'),
                environment: 'test',
                uptime: 100,
                platformDomain: {
                    name: 'Platform Core',
                    prefix: '/auth',
                    modules: ['auth', 'users'],
                    status: ServiceStatus.active(),
                },
                ecosystemDomain: {
                    name: 'Ecosystem Registry',
                    prefix: '/catalog',
                    modules: ['catalog', 'apps'],
                    status: ServiceStatus.active(),
                },
            });

            it('deve criar um agregado de manifesto com sucesso', () => {
                const manifest = createBaseManifest();
                expect(manifest.name).toBe('m-manage-hub');
                expect(manifest.version.toNormalizedString()).toBe('0.10.56');
                expect(manifest.environment).toBe('test');
                expect(manifest.calculateHealth()).toBe('healthy');
            });

            it('deve registrar serviços e impedir duplicidade de chaves (Idempotência/Unicidade)', () => {
                const manifest = createBaseManifest();
                const service = AppServiceEntity.create({
                    key: 'm-health',
                    name: 'HealthTech Care',
                    prefix: '/healthtech',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });

                manifest.registerService(service);
                expect(manifest.hasService('m-health')).toBe(true);
                expect(manifest.getService('m-health')?.name).toBe('HealthTech Care');

                // Tentativa de duplicidade deve lançar ServiceAlreadyRegisteredError
                expect(() => manifest.registerService(service)).toThrow(ServiceAlreadyRegisteredError);
            });

            it('deve impedir colisão de prefixo com domínios estruturais do Hub', () => {
                const manifest = createBaseManifest();

                // Colisão com prefixo reservado da Plataforma (/auth)
                const collidingPlatform = AppServiceEntity.create({
                    key: 'rogue-auth',
                    name: 'Rogue Auth',
                    prefix: '/auth',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });
                expect(() => manifest.registerService(collidingPlatform)).toThrow(ServiceAlreadyRegisteredError);

                // Colisão com prefixo reservado do Ecossistema (/catalog)
                const collidingEcosystem = AppServiceEntity.create({
                    key: 'rogue-catalog',
                    name: 'Rogue Catalog',
                    prefix: '/catalog',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });
                expect(() => manifest.registerService(collidingEcosystem)).toThrow(ServiceAlreadyRegisteredError);
            });

            it('deve impedir colisão de prefixo entre serviços verticais distintos', () => {
                const manifest = createBaseManifest();

                const service1 = AppServiceEntity.create({
                    key: 'service-one',
                    name: 'Service One',
                    prefix: '/shared-prefix',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });
                const service2 = AppServiceEntity.create({
                    key: 'service-two',
                    name: 'Service Two',
                    prefix: '/shared-prefix',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });

                manifest.registerService(service1);
                expect(() => manifest.registerService(service2)).toThrow(ServiceAlreadyRegisteredError);
            });

            it('deve desregistrar serviço existente e lançar ServiceNotFoundError para chave inexistente', () => {
                const manifest = createBaseManifest();
                const service = AppServiceEntity.create({
                    key: 'temp-service',
                    name: 'Temporary Service',
                    prefix: '/temp',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });

                manifest.registerService(service);
                expect(manifest.hasService('temp-service')).toBe(true);

                manifest.unregisterService('temp-service');
                expect(manifest.hasService('temp-service')).toBe(false);

                expect(() => manifest.unregisterService('non-existing-service')).toThrow(ServiceNotFoundError);
            });

            it('deve calcular status de integridade degradado se algum serviço estiver degradado', () => {
                const manifest = createBaseManifest();
                const healthySvc = AppServiceEntity.create({
                    key: 'svc-healthy',
                    name: 'Healthy Service',
                    prefix: '/healthy',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });
                const degradedSvc = AppServiceEntity.create({
                    key: 'svc-degraded',
                    name: 'Degraded Service',
                    prefix: '/degraded',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.degraded(),
                });

                manifest.registerService(healthySvc);
                manifest.registerService(degradedSvc);

                expect(manifest.calculateHealth()).toBe('degraded');
            });
        });
    });

    /* ========================================================================= */
    /* CAMADA 2: APLICAÇÃO (Use Cases & Business Orchestration)                  */
    /* ========================================================================= */
    describe('Camada 2: Aplicação (Use Cases & Application Business Rules)', () => {
        let inMemoryRepo: InMemoryHubServiceRepository;

        beforeEach(() => {
            InMemoryHubServiceRepository.resetInstance();
            inMemoryRepo = InMemoryHubServiceRepository.createEmpty();
        });

        describe('GetHubManifestUseCase', () => {
            it('deve obter o manifesto completo de forma desacoplada de banco de dados', async () => {
                const useCase = new GetHubManifestUseCase(inMemoryRepo);
                const manifest = await useCase.execute();

                expect(manifest).toBeDefined();
                expect(manifest.hub.name).toBe('m-manage-hub');
                expect(manifest.hub.status).toBe('healthy');
                expect(manifest.domains.platform.prefix).toBe('/auth');
                expect(manifest.domains.ecosystem.prefix).toBe('/catalog');
                expect(manifest.domains.services).toEqual({});
            });

            it('deve respeitar o filtro includeInactive para excluir serviços inativos/manutenção', async () => {
                // Popula repositório com um serviço ativo e outro inativo
                const activeSvc = AppServiceEntity.create({
                    key: 'active-svc',
                    name: 'Active Service',
                    prefix: '/active-svc',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                });
                const inactiveSvc = AppServiceEntity.create({
                    key: 'inactive-svc',
                    name: 'Inactive Service',
                    prefix: '/inactive-svc',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.inactive(),
                });

                await inMemoryRepo.save(activeSvc);
                await inMemoryRepo.save(inactiveSvc);

                const useCase = new GetHubManifestUseCase(inMemoryRepo);

                // Com includeInactive = false: deve conter apenas o ativo
                const manifestFiltered = await useCase.execute({ includeInactive: false });
                expect(manifestFiltered.domains.services['active-svc']).toBeDefined();
                expect(manifestFiltered.domains.services['inactive-svc']).toBeUndefined();

                // Com includeInactive = true: deve conter ambos
                const manifestFull = await useCase.execute({ includeInactive: true });
                expect(manifestFull.domains.services['active-svc']).toBeDefined();
                expect(manifestFull.domains.services['inactive-svc']).toBeDefined();
            });

            it('deve filtrar serviços por tag específica', async () => {
                const financeSvc = AppServiceEntity.create({
                    key: 'finance-svc',
                    name: 'Finance Module',
                    prefix: '/fin',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                    tags: ['finance', 'erp'],
                });
                const eduSvc = AppServiceEntity.create({
                    key: 'edu-svc',
                    name: 'Edu Module',
                    prefix: '/edu',
                    version: SemanticVersion.create('1.0.0'),
                    status: ServiceStatus.active(),
                    tags: ['education'],
                });

                await inMemoryRepo.save(financeSvc);
                await inMemoryRepo.save(eduSvc);

                const useCase = new GetHubManifestUseCase(inMemoryRepo);
                const result = await useCase.execute({ tag: 'finance' });

                expect(Object.keys(result.domains.services)).toEqual(['finance-svc']);
                expect(result.domains.services['finance-svc'].name).toBe('Finance Module');
            });
        });

        describe('RegisterServiceUseCase', () => {
            it('deve registrar dinamicamente um novo serviço vertical no catálogo', async () => {
                const useCase = new RegisterServiceUseCase(inMemoryRepo);
                const output = await useCase.execute({
                    key: 'm-gastro',
                    name: 'M-Gastronomia',
                    prefix: '/gastro',
                    version: '1.4.0',
                    status: 'active',
                    description: 'Comanda digital e PDV para restaurantes',
                    tags: ['restaurant', 'pos'],
                });

                expect(output.success).toBe(true);
                expect(output.service.key).toBe('m-gastro');
                expect(output.service.prefix).toBe('/gastro');
                expect(output.service.version).toBe('1.4.0');

                // Valida persistência imediata no repositório
                const persisted = await inMemoryRepo.findByKey('m-gastro');
                expect(persisted).not.toBeNull();
                expect(persisted?.name).toBe('M-Gastronomia');
            });

            it('deve lançar ServiceAlreadyRegisteredError ao tentar registrar chave duplicada', async () => {
                const useCase = new RegisterServiceUseCase(inMemoryRepo);
                await useCase.execute({
                    key: 'm-leads',
                    name: 'M-Leads CRM',
                    prefix: '/crm-leads',
                    version: '1.0.0',
                });

                await expect(
                    useCase.execute({
                        key: 'm-leads',
                        name: 'M-Leads Duplicate',
                        prefix: '/crm-other',
                        version: '1.0.1',
                    })
                ).rejects.toThrow(ServiceAlreadyRegisteredError);
            });

            it('deve validar parâmetros de entrada e lançar InvalidServiceConfigError se chave for omitida', async () => {
                const useCase = new RegisterServiceUseCase(inMemoryRepo);
                await expect(
                    useCase.execute({
                        key: '',
                        name: 'Empty Key Service',
                        prefix: '/empty',
                        version: '1.0.0',
                    })
                ).rejects.toThrow(InvalidServiceConfigError);
            });
        });

        describe('CheckHubHealthUseCase', () => {
            it('deve retornar status "healthy" quando banco de dados estiver conectado e operacional', async () => {
                const useCase = new CheckHubHealthUseCase(inMemoryRepo);
                const health = await useCase.execute({
                    dependencies: {
                        database: {
                            isConnected: true,
                            readyState: 1,
                            host: 'cluster0.mongodb.test',
                            database: 'm_manage_prod',
                        },
                    },
                });

                expect(health.status).toBe('healthy');
                expect(health.dependencies.database.connected).toBe(true);
                expect(health.dependencies.database.status).toBe('connected');
                expect(health.domains.platform.status).toBe('healthy');
                expect(health.domains.ecosystem.status).toBe('healthy');
            });

            it('deve retornar status degradado quando o banco de dados estiver desconectado', async () => {
                const useCase = new CheckHubHealthUseCase(inMemoryRepo);
                const health = await useCase.execute({
                    dependencies: {
                        database: {
                            isConnected: false,
                            readyState: 0,
                            error: 'Connection timeout (ETIMEDOUT)',
                        },
                    },
                });

                expect(health.status).toBe('degraded');
                expect(health.dependencies.database.connected).toBe(false);
                expect(health.dependencies.database.status).toBe('disconnected');
            });

            it('deve consolidar dependência opcional do RabbitMQ no relatório', async () => {
                const useCase = new CheckHubHealthUseCase(inMemoryRepo);
                const health = await useCase.execute({
                    dependencies: {
                        database: { isConnected: true, readyState: 1 },
                        rabbitmq: {
                            isConnected: true,
                            status: 'connected',
                            latencyMs: 4,
                        },
                    },
                });

                expect(health.dependencies.rabbitmq).toBeDefined();
                expect(health.dependencies.rabbitmq?.connected).toBe(true);
                expect(health.dependencies.rabbitmq?.latencyMs).toBe(4);
            });
        });
    });

    /* ========================================================================= */
    /* CAMADA 3 & 4: ADAPTADORES DE INTERFACE & HTTP E2E (Elysia Controllers)    */
    /* ========================================================================= */
    describe('Camada 3 & 4: Interface Adapters & Route Handlers (Elysia Engine)', () => {
        let repo: InMemoryHubServiceRepository;
        let app: Elysia;

        beforeEach(() => {
            InMemoryHubServiceRepository.resetInstance();
            repo = InMemoryHubServiceRepository.createEmpty();

            // Semeia dois serviços de exemplo para validação dos endpoints
            const bvaService = AppServiceEntity.create({
                key: 'm-bva',
                name: 'Studio BVA Moda',
                prefix: '/bva',
                version: SemanticVersion.create('1.2.0'),
                status: ServiceStatus.active(),
                tags: ['fashion', 'catalog'],
            });
            repo.save(bvaService);

            // Cria o controlador com injeção explícita de dependências desacopladas
            const hubCleanControllerInstance = createHubCleanController({
                hubRepository: repo,
                dbProvider: {
                    getConnectionStatus: () => ({
                        isConnected: true,
                        readyState: 1,
                        host: 'localhost:27017',
                        database: 'bun-api-test',
                    }),
                },
            });

            app = new Elysia().use(hubCleanControllerInstance);
        });

        it('GET /hub/manifest deve responder com status 200 e contrato canônico do Hub', async () => {
            const response = await app.handle(new Request('http://localhost/hub/manifest'));

            expect(response.status).toBe(200);
            const data = await response.json();

            expect(data.hub).toBeDefined();
            expect(data.hub.name).toBe('m-manage-hub');
            expect(data.hub.status).toBe('healthy');
            expect(typeof data.hub.uptime).toBe('number');

            expect(data.domains).toBeDefined();
            expect(data.domains.platform.prefix).toBe('/auth');
            expect(data.domains.ecosystem.prefix).toBe('/catalog');

            expect(data.domains.services['m-bva']).toBeDefined();
            expect(data.domains.services['m-bva'].name).toBe('Studio BVA Moda');
            expect(data.domains.services['m-bva'].prefix).toBe('/bva');
            expect(data.domains.services['m-bva'].version).toBe('1.2.0');
        });

        it('GET /hub/manifest com query param ?tag= deve filtrar serviços declarativamente', async () => {
            const response = await app.handle(new Request('http://localhost/hub/manifest?tag=fashion'));

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.domains.services['m-bva']).toBeDefined();

            const nonMatchingResponse = await app.handle(new Request('http://localhost/hub/manifest?tag=fintech'));
            const nonMatchingData = await nonMatchingResponse.json();
            expect(nonMatchingData.domains.services['m-bva']).toBeUndefined();
        });

        it('GET /hub/health deve responder com status 200 e integridade dos subsistemas', async () => {
            const response = await app.handle(new Request('http://localhost/hub/health'));

            expect(response.status).toBe(200);
            const data = await response.json();

            expect(data.status).toBe('healthy');
            expect(data.database).toBeDefined();
            expect(data.database.connected).toBe(true);
            expect(data.database.status).toBe('connected');
            expect(data.domains.platform.status).toBe('healthy');
            expect(data.domains.ecosystem.status).toBe('healthy');
        });

        it('GET /hub deve responder com status 200 no envelope padronizado { success: true, data }', async () => {
            const response = await app.handle(new Request('http://localhost/hub'));

            expect(response.status).toBe(200);
            const data = await response.json();

            expect(data.success).toBe(true);
            expect(data.data.hub.name).toBe('m-manage-hub');
        });

        it('POST /hub/services deve registrar um serviço dinamicamente e retornar status 201 Created', async () => {
            const payload = {
                key: 'm-healthtech',
                name: 'M-HealthTech Pharma',
                prefix: '/healthtech',
                version: '1.0.0',
                status: 'active',
                description: 'Farmácia de manipulação e telemedicina',
                tags: ['health', 'pharma'],
            };

            const response = await app.handle(
                new Request('http://localhost/hub/services', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
            );

            expect(response.status).toBe(201);
            const data = await response.json();

            expect(data.success).toBe(true);
            expect(data.service.key).toBe('m-healthtech');
            expect(data.service.prefix).toBe('/healthtech');

            // Verifica se o manifesto agora expõe o novo serviço registrado via HTTP
            const manifestResponse = await app.handle(new Request('http://localhost/hub/manifest'));
            const manifestData = await manifestResponse.json();
            expect(manifestData.domains.services['m-healthtech']).toBeDefined();
            expect(manifestData.domains.services['m-healthtech'].name).toBe('M-HealthTech Pharma');
        });

        it('POST /hub/services com chave duplicada deve responder com status 409 Conflict', async () => {
            const payload = {
                key: 'm-bva', // Já registrado no beforeEach
                name: 'Duplicate BVA',
                prefix: '/bva-duplicate',
                version: '1.0.0',
            };

            const response = await app.handle(
                new Request('http://localhost/hub/services', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
            );

            expect(response.status).toBe(409);
            const data = await response.json();
            expect(data.success).toBe(false);
            expect(data.code).toBe('SERVICE_ALREADY_REGISTERED');
        });

        it('POST /hub/services com versão SemVer inválida deve responder com status 400 Bad Request', async () => {
            const payload = {
                key: 'm-invalid-semver',
                name: 'Invalid SemVer Service',
                prefix: '/invalid-semver',
                version: 'invalid-version-string',
            };

            const response = await app.handle(
                new Request('http://localhost/hub/services', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
            );

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.success).toBe(false);
            expect(data.code).toBe('INVALID_SEMANTIC_VERSION');
        });

        it('deve manter compatibilidade na exportação padrão hubCleanRoutes', async () => {
            const defaultApp = new Elysia().use(hubCleanRoutes);
            const response = await defaultApp.handle(new Request('http://localhost/hub/manifest'));

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.hub.name).toBe('m-manage-hub');
        });
    });
});
