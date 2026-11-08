import { InvalidServiceConfigError, ServiceAlreadyRegisteredError, ServiceNotFoundError } from '../errors/hub.errors';
import { SemanticVersion } from '../valueObjects/semanticVersion.vo';
import { ServiceStatus } from '../valueObjects/serviceStatus.vo';
import { AppServiceEntity } from './appService.entity';

export type HubHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DomainPartition {
    name: string;
    prefix: string;
    modules: string[];
    status: ServiceStatus;
    description?: string;
}

export interface HubManifestProps {
    name: string;
    version: SemanticVersion;
    environment: string;
    uptime?: number;
    platformDomain: DomainPartition;
    ecosystemDomain: DomainPartition;
    services?: AppServiceEntity[];
}

export interface HubManifestDTO {
    hub: {
        name: string;
        version: string;
        environment: string;
        status: HubHealthStatus;
        uptime: number;
        timestamp: string;
    };
    domains: {
        platform: {
            name: string;
            prefix: string;
            modules: string[];
            status: string;
            description?: string;
        };
        ecosystem: {
            name: string;
            prefix: string;
            modules: string[];
            status: string;
            description?: string;
        };
        services: Record<string, {
            name: string;
            prefix: string;
            status: string;
            version: string;
            description?: string;
            tags?: string[];
            metadata?: Record<string, unknown>;
        }>;
    };
}

/**
 * Entidade Raiz de Agregação (Aggregate Root) representando a Topologia e Manifesto do Hub.
 * Controla invariantes de arquitetura, colisões de rotas/prefixos e computação de saúde global.
 */
export class HubManifestEntity {
    private readonly _name: string;
    private readonly _version: SemanticVersion;
    private readonly _environment: string;
    private readonly _startTime: number;
    private _platformDomain: DomainPartition;
    private _ecosystemDomain: DomainPartition;
    private readonly _services: Map<string, AppServiceEntity>;

    private constructor(props: HubManifestProps) {
        this.validateBase(props);

        this._name = props.name.trim();
        this._version = props.version;
        this._environment = props.environment.trim();
        this._startTime = Date.now() - (props.uptime ? props.uptime * 1000 : 0);
        this._platformDomain = this.validateDomainPartition('Platform', props.platformDomain);
        this._ecosystemDomain = this.validateDomainPartition('Ecosystem', props.ecosystemDomain);
        this._services = new Map();

        if (props.services) {
            for (const svc of props.services) {
                this.registerService(svc);
            }
        }
    }

    public static create(props: HubManifestProps): HubManifestEntity {
        return new HubManifestEntity(props);
    }

    private validateBase(props: HubManifestProps): void {
        if (!props.name || props.name.trim().length === 0) {
            throw new InvalidServiceConfigError('Hub name cannot be empty.');
        }
        if (!props.version || !(props.version instanceof SemanticVersion)) {
            throw new InvalidServiceConfigError('Hub version must be a valid SemanticVersion instance.');
        }
        if (!props.environment || props.environment.trim().length === 0) {
            throw new InvalidServiceConfigError('Hub environment cannot be empty.');
        }
    }

    private validateDomainPartition(name: string, domain: DomainPartition): DomainPartition {
        if (!domain) {
            throw new InvalidServiceConfigError(`Domain partition '${name}' configuration is required.`);
        }
        if (!domain.prefix || !domain.prefix.startsWith('/')) {
            throw new InvalidServiceConfigError(
                `Domain partition '${name}' prefix must be non-empty and start with a leading slash ('/').`
            );
        }
        if (!domain.status || !(domain.status instanceof ServiceStatus)) {
            throw new InvalidServiceConfigError(
                `Domain partition '${name}' must have a valid ServiceStatus instance.`
            );
        }
        return {
            name: domain.name || name,
            prefix: domain.prefix.trim().replace(/\/+$/, '') || '/',
            modules: Array.isArray(domain.modules) ? [...domain.modules] : [],
            status: domain.status,
            description: domain.description?.trim()
        };
    }

    // Domain Aggregation Rules
    public registerService(service: AppServiceEntity): void {
        if (!service || !(service instanceof AppServiceEntity)) {
            throw new InvalidServiceConfigError('Valid AppServiceEntity is required to register a service.');
        }

        const key = service.key;
        if (this._services.has(key)) {
            throw new ServiceAlreadyRegisteredError(`key '${key}'`);
        }

        // Checagem de colisão de prefixo
        const prefix = service.prefix;
        if (this._platformDomain.prefix === prefix) {
            throw new ServiceAlreadyRegisteredError(`prefix '${prefix}' collides with Platform domain`);
        }
        if (this._ecosystemDomain.prefix === prefix) {
            throw new ServiceAlreadyRegisteredError(`prefix '${prefix}' collides with Ecosystem domain`);
        }

        for (const existing of this._services.values()) {
            if (existing.prefix === prefix) {
                throw new ServiceAlreadyRegisteredError(
                    `prefix '${prefix}' is already registered by service '${existing.key}'`
                );
            }
        }

        this._services.set(key, service);
    }

    public unregisterService(key: string): void {
        const normalizedKey = key.trim().toLowerCase();
        if (!this._services.has(normalizedKey)) {
            throw new ServiceNotFoundError(normalizedKey);
        }
        this._services.delete(normalizedKey);
    }

    public getService(key: string): AppServiceEntity | undefined {
        return this._services.get(key.trim().toLowerCase());
    }

    public hasService(key: string): boolean {
        return this._services.has(key.trim().toLowerCase());
    }

    public listServices(): AppServiceEntity[] {
        return Array.from(this._services.values());
    }

    /**
     * Calcula o status global do Hub com base na integridade dos domínios base e serviços verticais.
     * Invariantes:
     * - Se plataforma ou ecossistema inativos/degradados -> 'degraded' ou 'unhealthy'.
     * - Se mais de 50% dos serviços inativos -> 'unhealthy'.
     * - Se qualquer serviço estiver degradado ou inativo -> 'degraded'.
     * - Se todos 100% ativos -> 'healthy'.
     */
    public calculateHealth(): HubHealthStatus {
        if (!this._platformDomain.status.isActive() || !this._ecosystemDomain.status.isActive()) {
            return 'degraded';
        }

        const services = this.listServices();
        if (services.length === 0) {
            return 'healthy';
        }

        let inactiveCount = 0;
        let degradedCount = 0;

        for (const svc of services) {
            if (svc.status.isInactive() || svc.status.isMaintenance()) {
                inactiveCount++;
            } else if (svc.status.isDegraded()) {
                degradedCount++;
            }
        }

        if (inactiveCount > services.length / 2) {
            return 'unhealthy';
        }

        if (inactiveCount > 0 || degradedCount > 0) {
            return 'degraded';
        }

        return 'healthy';
    }

    public get uptimeSeconds(): number {
        return Math.floor((Date.now() - this._startTime) / 1000);
    }

    public get name(): string {
        return this._name;
    }

    public get version(): SemanticVersion {
        return this._version;
    }

    public get environment(): string {
        return this._environment;
    }

    public get platformDomain(): DomainPartition {
        return { ...this._platformDomain, modules: [...this._platformDomain.modules] };
    }

    public get ecosystemDomain(): DomainPartition {
        return { ...this._ecosystemDomain, modules: [...this._ecosystemDomain.modules] };
    }

    /**
     * Converte para DTO compatível com a especificação REST da API do Hub
     */
    public toDTO(): HubManifestDTO {
        const servicesDto: HubManifestDTO['domains']['services'] = {};

        for (const svc of this._services.values()) {
            servicesDto[svc.key] = {
                name: svc.name,
                prefix: svc.prefix,
                status: svc.status.value,
                version: svc.version.toString(),
                description: svc.description,
                tags: svc.tags,
                metadata: { ...svc.metadata }
            };
        }

        return {
            hub: {
                name: this._name,
                version: this._version.toString(),
                environment: this._environment,
                status: this.calculateHealth(),
                uptime: this.uptimeSeconds,
                timestamp: new Date().toISOString()
            },
            domains: {
                platform: {
                    name: this._platformDomain.name,
                    prefix: this._platformDomain.prefix,
                    modules: [...this._platformDomain.modules],
                    status: this._platformDomain.status.value,
                    description: this._platformDomain.description
                },
                ecosystem: {
                    name: this._ecosystemDomain.name,
                    prefix: this._ecosystemDomain.prefix,
                    modules: [...this._ecosystemDomain.modules],
                    status: this._ecosystemDomain.status.value,
                    description: this._ecosystemDomain.description
                },
                services: servicesDto
            }
        };
    }

    public toJSON(): HubManifestDTO {
        return this.toDTO();
    }
}
