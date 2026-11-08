import {
    DomainInfo,
    HubDomains,
    HubHealthResponse,
    HubHealthStatus,
    HubManifest,
    HubMetadata,
    ServiceInfo,
    ServiceOperationalStatus,
} from './hub.types';

/**
 * HubRegistry
 * 
 * Registro central dos domínios, contextos e microsserviços do ecossistema m-manage.
 * Segue o padrão Registry / Clean Architecture para service discovery e health aggregation.
 * 
 * @class HubRegistry
 */
export class HubRegistry {
    private static instance: HubRegistry;

    private readonly hubMetadata: HubMetadata = {
        name: 'm-manage-hub',
        version: '0.10.53',
        environment: process.env.NODE_ENV || 'production',
        status: 'healthy',
    };

    private readonly domains: HubDomains = {
        platform: {
            name: 'Platform Hub (Core)',
            description: 'Gestão de identidades globais, usuários, chaves de API, logs de auditoria e agendador de tarefas.',
            prefix: '/auth',
            modules: ['auth', 'adminClients', 'credentials', 'logs', 'tasks'],
            status: 'active',
        },
        ecosystem: {
            name: 'Ecosystem & Licensing',
            description: 'Vitrine de aplicações (Marketplace), provisionamento e verificação de licenças (mAppAccess), formulários e leads.',
            prefix: '/catalog',
            modules: ['catalog', 'apps', 'clientForms', 'mLeadsRequest'],
            status: 'active',
        },
        services: {
            bva: {
                name: 'Studio BVA',
                description: 'Moda, Catálogo & Gestão de Consultoras BVA',
                prefix: '/bva',
                status: 'active',
                version: '1.2',
                tags: ['ecommerce', 'catalog', 'fashion'],
            },
            mCursos: {
                name: 'M-Cursos',
                description: 'Educação EAD & LMS Corporativo',
                prefix: '/m-cursos',
                status: 'active',
                version: '2.0',
                tags: ['education', 'lms', 'elearning'],
            },
            erp: {
                name: 'ERP Core',
                description: 'ERP Industrial & Gestão Corporativa',
                prefix: '/erp',
                status: 'active',
                version: '1.0',
                tags: ['erp', 'enterprise', 'operations'],
            },
            erpFinance: {
                name: 'ERP Finance',
                description: 'ERP Módulo Financeiro & Contábil',
                prefix: '/erp-finance',
                status: 'active',
                version: '1.0',
                tags: ['finance', 'accounting', 'invoicing'],
            },
            healthtech: {
                name: 'HealthTech',
                description: 'Farmácia de Manipulação 4.0 & Saúde',
                prefix: '/healthtech',
                status: 'active',
                version: '1.1',
                tags: ['health', 'pharma', 'clinical'],
            },
            restaurant: {
                name: 'Restaurant & Gastro',
                description: 'Gastronomia & Food Service',
                prefix: '/restaurant',
                status: 'active',
                version: '1.0',
                tags: ['food', 'restaurant', 'pos'],
            },
            blogs: {
                name: 'Blogs & CMS',
                description: 'CMS & Publicações de Conteúdo',
                prefix: '/blogs',
                status: 'active',
                version: '1.0',
                tags: ['cms', 'content', 'blog'],
            },
            content: {
                name: 'Institutional Content',
                description: 'Gestão Dinâmica de Conteúdo Institucional',
                prefix: '/content',
                status: 'active',
                version: '1.0',
                tags: ['content', 'marketing'],
            },
        },
    };

    private constructor() { }

    /**
     * Retorna a instância única do HubRegistry (Singleton)
     */
    public static getInstance(): HubRegistry {
        if (!HubRegistry.instance) {
            HubRegistry.instance = new HubRegistry();
        }
        return HubRegistry.instance;
    }

    /**
     * Retorna o manifesto completo do Hub com metadados e topologia de domínios
     */
    public getManifest(): HubManifest {
        return {
            hub: {
                ...this.hubMetadata,
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
            },
            domains: {
                platform: { ...this.domains.platform },
                ecosystem: { ...this.domains.ecosystem },
                services: { ...this.domains.services },
            },
        };
    }

    /**
     * Retorna a estrutura bruta de domínios
     */
    public getDomains(): HubDomains {
        return this.domains;
    }

    /**
     * Obtém as informações de um domínio principal (platform ou ecosystem)
     */
    public getDomain(name: 'platform' | 'ecosystem'): DomainInfo {
        return this.domains[name];
    }

    /**
     * Obtém um serviço específico registrado no Hub
     */
    public getService(serviceKey: string): ServiceInfo | undefined {
        return this.domains.services[serviceKey];
    }

    /**
     * Registra ou atualiza dinamicamente um serviço no Hub
     */
    public registerService(serviceKey: string, service: ServiceInfo): void {
        this.domains.services[serviceKey] = service;
    }

    /**
     * Atualiza o status operacional de um serviço existente
     */
    public updateServiceStatus(serviceKey: string, status: ServiceOperationalStatus): boolean {
        if (this.domains.services[serviceKey]) {
            this.domains.services[serviceKey].status = status;
            return true;
        }
        return false;
    }

    /**
     * Consolida a saúde de todos os domínios e serviços ativos
     */
    public getHealthSummary(dbStatus: {
        isConnected: boolean;
        readyState?: number;
        host?: string;
        database?: string;
    }): HubHealthResponse {
        const servicesList = Object.values(this.domains.services);
        const totalServices = servicesList.length;
        const activeServices = servicesList.filter((s) => s.status === 'active').length;

        const isPlatformActive = this.domains.platform.status === 'active';
        const isEcosystemActive = this.domains.ecosystem.status === 'active';
        const isDatabaseHealthy = dbStatus.isConnected && dbStatus.readyState === 1;

        // Determina o status consolidado do Hub
        let overallStatus: HubHealthStatus = 'healthy';
        if (!isDatabaseHealthy || activeServices < totalServices * 0.7) {
            overallStatus = 'degraded';
        }
        if (!dbStatus.isConnected && activeServices === 0) {
            overallStatus = 'unhealthy';
        }

        const simplifiedServices: Record<string, { status: ServiceOperationalStatus; version: string }> = {};
        for (const [key, svc] of Object.entries(this.domains.services)) {
            simplifiedServices[key] = {
                status: svc.status,
                version: svc.version,
            };
        }

        return {
            success: overallStatus !== 'unhealthy',
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: this.hubMetadata.version,
            environment: this.hubMetadata.environment,
            database: {
                connected: dbStatus.isConnected,
                status: isDatabaseHealthy ? 'connected' : 'disconnected',
                host: dbStatus.host,
                database: dbStatus.database,
            },
            domains: {
                platform: {
                    status: isPlatformActive ? 'healthy' : 'degraded',
                    totalUnits: this.domains.platform.modules.length,
                    activeUnits: isPlatformActive ? this.domains.platform.modules.length : 0,
                    modules: [...this.domains.platform.modules],
                },
                ecosystem: {
                    status: isEcosystemActive ? 'healthy' : 'degraded',
                    totalUnits: this.domains.ecosystem.modules.length,
                    activeUnits: isEcosystemActive ? this.domains.ecosystem.modules.length : 0,
                    modules: [...this.domains.ecosystem.modules],
                },
                services: {
                    status: activeServices === totalServices ? 'healthy' : 'degraded',
                    totalUnits: totalServices,
                    activeUnits: activeServices,
                    services: simplifiedServices,
                },
            },
        };
    }
}

/**
 * Instância Singleton exportada do HubRegistry
 */
export const hubRegistry = HubRegistry.getInstance();
