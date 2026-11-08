/**
 * In-Memory Hub Service Repository
 * 
 * Camada 3: Infraestrutura (Frameworks & Drivers / Repositories)
 * Implementação em memória de alta performance do repositório do Hub Central.
 * 
 * Ideal para:
 * - Bootstrapping imediato do ecossistema m-manage sem acoplamento a banco no startup
 * - Testes de unidade e integração desacoplados
 * - Baixíssima latência (O(1)) para Service Discovery e Heartbeats
 * 
 * @module InMemoryHubServiceRepository
 * @version 0.10.56
 */

import {
    AppServiceEntity,
    HubManifestEntity,
    IHubServiceRepository,
    SemanticVersion,
    ServiceStatus,
} from '../../domain';

/**
 * Repositório em memória para catálogo de serviços e manifesto do Hub.
 * Implementa o contrato de domínio IHubServiceRepository seguindo Clean Architecture.
 */
export class InMemoryHubServiceRepository implements IHubServiceRepository {
    private static instance: InMemoryHubServiceRepository | null = null;

    private readonly _services: Map<string, AppServiceEntity> = new Map();
    private _manifest!: HubManifestEntity;

    /**
     * Construtor da classe.
     * 
     * @param initialServices Lista opcional de serviços iniciais
     * @param customManifest Manifesto customizado opcional
     * @param autoSeed Se true, popula com os serviços padrão do ecossistema m-manage
     */
    constructor(
        initialServices?: AppServiceEntity[],
        customManifest?: HubManifestEntity,
        autoSeed: boolean = true
    ) {
        if (customManifest) {
            this._manifest = customManifest;
            for (const svc of customManifest.listServices()) {
                this._services.set(svc.key, svc);
            }
        } else {
            this.initializeDefaultManifest();
        }

        if (initialServices && initialServices.length > 0) {
            for (const svc of initialServices) {
                this.registerOrUpdate(svc);
            }
        } else if (autoSeed && (!initialServices || initialServices.length === 0) && !customManifest) {
            this.seedDefaultServices();
        }
    }

    /**
     * Retorna a instância única singleton do repositório em memória
     */
    public static getInstance(): InMemoryHubServiceRepository {
        if (!InMemoryHubServiceRepository.instance) {
            InMemoryHubServiceRepository.instance = new InMemoryHubServiceRepository();
        }
        return InMemoryHubServiceRepository.instance;
    }

    /**
     * Factory method para criar uma instância limpa/vazia (útil para testes isolados)
     */
    public static createEmpty(): InMemoryHubServiceRepository {
        return new InMemoryHubServiceRepository([], undefined, false);
    }

    /**
     * Reseta a instância singleton (útil para suíte de testes)
     */
    public static resetInstance(): void {
        InMemoryHubServiceRepository.instance = null;
    }

    /**
     * Inicializa a agregação raiz do manifesto com a topologia padrão da m-manage
     */
    private initializeDefaultManifest(): void {
        this._manifest = HubManifestEntity.create({
            name: 'm-manage-hub',
            version: SemanticVersion.create('0.10.56'),
            environment: process.env.NODE_ENV || 'production',
            uptime: process.uptime(),
            platformDomain: {
                name: 'Platform Hub (Core)',
                description: 'Gestão de identidades globais, usuários, chaves de API, logs de auditoria e agendador de tarefas.',
                prefix: '/auth',
                modules: ['auth', 'adminClients', 'credentials', 'logs', 'tasks'],
                status: ServiceStatus.active(),
            },
            ecosystemDomain: {
                name: 'Ecosystem & Licensing',
                description: 'Vitrine de aplicações (Marketplace), provisionamento e verificação de licenças (mAppAccess), formulários e leads.',
                prefix: '/catalog',
                modules: ['catalog', 'apps', 'clientForms', 'mLeadsRequest'],
                status: ServiceStatus.active(),
            },
            services: [],
        });
    }

    /**
     * Popula os serviços verticais padrão documentados na topologia do ecossistema
     */
    private seedDefaultServices(): void {
        const defaultServices: Array<{
            key: string;
            name: string;
            prefix: string;
            version: string;
            status: string;
            description: string;
            tags: string[];
        }> = [
            {
                key: 'bva',
                name: 'Studio BVA',
                description: 'Moda, Catálogo & Gestão de Consultoras BVA',
                prefix: '/bva',
                status: 'active',
                version: '1.2.0',
                tags: ['ecommerce', 'catalog', 'fashion'],
            },
            {
                key: 'mcursos',
                name: 'M-Cursos',
                description: 'Educação EAD & LMS Corporativo',
                prefix: '/m-cursos',
                status: 'active',
                version: '2.0.0',
                tags: ['education', 'lms', 'elearning'],
            },
            {
                key: 'erp',
                name: 'ERP Core',
                description: 'ERP Industrial & Gestão Corporativa',
                prefix: '/erp',
                status: 'active',
                version: '1.0.0',
                tags: ['erp', 'enterprise', 'operations'],
            },
            {
                key: 'erpfinance',
                name: 'ERP Finance',
                description: 'ERP Módulo Financeiro & Contábil',
                prefix: '/erp-finance',
                status: 'active',
                version: '1.0.0',
                tags: ['finance', 'accounting', 'invoicing'],
            },
            {
                key: 'healthtech',
                name: 'HealthTech',
                description: 'Farmácia de Manipulação 4.0 & Saúde',
                prefix: '/healthtech',
                status: 'active',
                version: '1.1.0',
                tags: ['health', 'pharma', 'clinical'],
            },
            {
                key: 'restaurant',
                name: 'Restaurant & Gastro',
                description: 'Gastronomia & Food Service',
                prefix: '/restaurant',
                status: 'active',
                version: '1.0.0',
                tags: ['food', 'restaurant', 'pos'],
            },
            {
                key: 'blogs',
                name: 'Blogs & CMS',
                description: 'CMS & Publicações de Conteúdo',
                prefix: '/blogs',
                status: 'active',
                version: '1.0.0',
                tags: ['cms', 'content', 'blog'],
            },
            {
                key: 'content',
                name: 'Institutional Content',
                description: 'Gestão Dinâmica de Conteúdo Institucional',
                prefix: '/content',
                status: 'active',
                version: '1.0.0',
                tags: ['content', 'marketing'],
            },
        ];

        for (const item of defaultServices) {
            try {
                const entity = AppServiceEntity.create({
                    key: item.key,
                    name: item.name,
                    description: item.description,
                    prefix: item.prefix,
                    status: ServiceStatus.create(item.status),
                    version: SemanticVersion.create(item.version),
                    tags: item.tags,
                });
                this.registerOrUpdate(entity);
            } catch {
                // Silently skip if invalid seed in edge cases
            }
        }
    }

    /**
     * Registra ou atualiza um serviço na coleção interna e no agregador de manifesto
     */
    private registerOrUpdate(service: AppServiceEntity): void {
        const key = service.key;
        this._services.set(key, service);

        if (this._manifest.hasService(key)) {
            this._manifest.unregisterService(key);
        }
        this._manifest.registerService(service);
    }

    /**
     * Persiste ou atualiza um serviço vertical no catálogo do Hub
     */
    public async save(service: AppServiceEntity): Promise<void> {
        this.registerOrUpdate(service);
    }

    /**
     * Busca um serviço pela sua chave única de identificação (ex: 'erp', 'bva')
     */
    public async findByKey(key: string): Promise<AppServiceEntity | null> {
        const normalized = key.trim().toLowerCase();
        return this._services.get(normalized) || null;
    }

    /**
     * Busca um serviço pelo prefixo de rota configurado (ex: '/erp', '/bva')
     */
    public async findByPrefix(prefix: string): Promise<AppServiceEntity | null> {
        const normalized = prefix.trim().replace(/\/+$/, '') || '/';
        for (const service of this._services.values()) {
            if (service.prefix === normalized || service.prefix === prefix) {
                return service;
            }
        }
        return null;
    }

    /**
     * Retorna todos os serviços verticais registrados
     */
    public async findAll(): Promise<AppServiceEntity[]> {
        return Array.from(this._services.values());
    }

    /**
     * Remove um serviço pelo identificador único. Retorna true se removido com sucesso.
     */
    public async delete(key: string): Promise<boolean> {
        const normalized = key.trim().toLowerCase();
        if (!this._services.has(normalized)) {
            return false;
        }

        this._services.delete(normalized);
        if (this._manifest.hasService(normalized)) {
            this._manifest.unregisterService(normalized);
        }
        return true;
    }

    /**
     * Verifica se existe um serviço registrado com a chave especificada
     */
    public async existsByKey(key: string): Promise<boolean> {
        const normalized = key.trim().toLowerCase();
        return this._services.has(normalized);
    }

    /**
     * Retorna a entidade agregada do Manifesto completo do Hub
     */
    public async getManifest(): Promise<HubManifestEntity> {
        return this._manifest;
    }

    /**
     * Salva ou atualiza a fotografia do manifesto do Hub
     */
    public async saveManifest(manifest: HubManifestEntity): Promise<void> {
        this._manifest = manifest;
        this._services.clear();
        for (const svc of manifest.listServices()) {
            this._services.set(svc.key, svc);
        }
    }
}

/**
 * Instância Singleton padrão exportada para o runtime
 */
export const inMemoryHubServiceRepository = InMemoryHubServiceRepository.getInstance();
