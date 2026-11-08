import { InvalidServiceConfigError } from '../errors/hub.errors';
import { SemanticVersion } from '../valueObjects/semanticVersion.vo';
import { ServiceStatus } from '../valueObjects/serviceStatus.vo';

export interface AppServiceProps {
    id?: string;
    key: string;
    name: string;
    prefix: string;
    version: SemanticVersion;
    status: ServiceStatus;
    description?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface AppServiceDTO {
    id: string;
    key: string;
    name: string;
    prefix: string;
    version: string;
    status: string;
    description?: string;
    tags: string[];
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

/**
 * Entidade de Domínio representando um Serviço Vertical registrado no Hub Central.
 * Encapsula invariantes de negócio, versionamento semântico, ciclo de vida e roteamento de prefixo.
 */
export class AppServiceEntity {
    private readonly _id: string;
    private readonly _key: string;
    private _name: string;
    private _prefix: string;
    private _version: SemanticVersion;
    private _status: ServiceStatus;
    private _description?: string;
    private _tags: Set<string>;
    private _metadata: Record<string, unknown>;
    private readonly _createdAt: Date;
    private _updatedAt: Date;

    private constructor(props: AppServiceProps) {
        this.validateProps(props);

        this._id = props.id || props.key;
        this._key = props.key.trim().toLowerCase();
        this._name = props.name.trim();
        this._prefix = this.normalizePrefix(props.prefix);
        this._version = props.version;
        this._status = props.status;
        this._description = props.description?.trim();
        this._tags = new Set(props.tags?.map(t => t.trim().toLowerCase()) || []);
        this._metadata = { ...(props.metadata || {}) };
        this._createdAt = props.createdAt || new Date();
        this._updatedAt = props.updatedAt || new Date();
    }

    /**
     * Factory method para criação de nova entidade com validação completa.
     */
    public static create(props: AppServiceProps): AppServiceEntity {
        return new AppServiceEntity(props);
    }

    /**
     * Reconstitui entidade existente (ex: a partir de persistência/banco).
     */
    public static reconstitute(props: AppServiceProps): AppServiceEntity {
        return new AppServiceEntity(props);
    }

    private validateProps(props: AppServiceProps): void {
        if (!props.key || typeof props.key !== 'string' || props.key.trim().length === 0) {
            throw new InvalidServiceConfigError('Service key cannot be empty.');
        }

        const keyRegex = /^[a-z0-9-_]+$/i;
        if (!keyRegex.test(props.key.trim())) {
            throw new InvalidServiceConfigError(
                `Service key '${props.key}' contains invalid characters. Only alphanumeric, dashes and underscores are allowed.`
            );
        }

        if (!props.name || typeof props.name !== 'string' || props.name.trim().length === 0) {
            throw new InvalidServiceConfigError('Service name cannot be empty.');
        }

        if (!props.prefix || typeof props.prefix !== 'string' || props.prefix.trim().length === 0) {
            throw new InvalidServiceConfigError('Service prefix cannot be empty.');
        }

        if (!props.prefix.trim().startsWith('/')) {
            throw new InvalidServiceConfigError(`Service prefix '${props.prefix}' must start with a leading slash ('/').`);
        }

        if (!props.version || !(props.version instanceof SemanticVersion)) {
            throw new InvalidServiceConfigError('A valid SemanticVersion instance is required.');
        }

        if (!props.status || !(props.status instanceof ServiceStatus)) {
            throw new InvalidServiceConfigError('A valid ServiceStatus instance is required.');
        }
    }

    private normalizePrefix(prefix: string): string {
        const trimmed = prefix.trim();
        const withoutTrailing = trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
        return withoutTrailing;
    }

    // Getters
    public get id(): string {
        return this._id;
    }

    public get key(): string {
        return this._key;
    }

    public get name(): string {
        return this._name;
    }

    public get prefix(): string {
        return this._prefix;
    }

    public get version(): SemanticVersion {
        return this._version;
    }

    public get status(): ServiceStatus {
        return this._status;
    }

    public get description(): string | undefined {
        return this._description;
    }

    public get tags(): string[] {
        return Array.from(this._tags);
    }

    public get metadata(): Readonly<Record<string, unknown>> {
        return Object.freeze({ ...this._metadata });
    }

    public get createdAt(): Date {
        return this._createdAt;
    }

    public get updatedAt(): Date {
        return this._updatedAt;
    }

    // Domain Mutators & Methods
    public updateStatus(newStatus: ServiceStatus): void {
        if (!newStatus || !(newStatus instanceof ServiceStatus)) {
            throw new InvalidServiceConfigError('Cannot update status: Invalid ServiceStatus provided.');
        }
        if (!this._status.equals(newStatus)) {
            this._status = newStatus;
            this._updatedAt = new Date();
        }
    }

    public updateVersion(newVersion: SemanticVersion): void {
        if (!newVersion || !(newVersion instanceof SemanticVersion)) {
            throw new InvalidServiceConfigError('Cannot update version: Invalid SemanticVersion provided.');
        }
        this._version = newVersion;
        this._updatedAt = new Date();
    }

    public updatePrefix(newPrefix: string): void {
        if (!newPrefix || !newPrefix.trim().startsWith('/')) {
            throw new InvalidServiceConfigError(`Prefix '${newPrefix}' must start with a leading slash ('/').`);
        }
        this._prefix = this.normalizePrefix(newPrefix);
        this._updatedAt = new Date();
    }

    public updateDetails(name?: string, description?: string): void {
        let changed = false;
        if (name && name.trim().length > 0 && name.trim() !== this._name) {
            this._name = name.trim();
            changed = true;
        }
        if (description !== undefined && description.trim() !== this._description) {
            this._description = description.trim();
            changed = true;
        }
        if (changed) {
            this._updatedAt = new Date();
        }
    }

    public addTag(tag: string): void {
        const clean = tag?.trim().toLowerCase();
        if (clean && !this._tags.has(clean)) {
            this._tags.add(clean);
            this._updatedAt = new Date();
        }
    }

    public hasTag(tag: string): boolean {
        return this._tags.has(tag?.trim().toLowerCase());
    }

    public activate(): void {
        this.updateStatus(ServiceStatus.active());
    }

    public degrade(): void {
        this.updateStatus(ServiceStatus.degraded());
    }

    public putInMaintenance(): void {
        this.updateStatus(ServiceStatus.maintenance());
    }

    public deactivate(): void {
        this.updateStatus(ServiceStatus.inactive());
    }

    public removeTag(tag: string): void {
        const clean = tag?.trim().toLowerCase();
        if (clean && this._tags.has(clean)) {
            this._tags.delete(clean);
            this._updatedAt = new Date();
        }
    }

    public updateMetadata(metadata: Record<string, unknown>): void {
        if (!metadata || typeof metadata !== 'object') {
            throw new InvalidServiceConfigError('Metadata must be a valid object.');
        }
        this._metadata = { ...this._metadata, ...metadata };
        this._updatedAt = new Date();
    }

    /**
     * Serialização segura e determinística para DTO
     */
    public toDTO(): AppServiceDTO {
        return {
            id: this._id,
            key: this._key,
            name: this._name,
            prefix: this._prefix,
            version: this._version.toString(),
            status: this._status.value,
            description: this._description,
            tags: this.tags,
            metadata: { ...this._metadata },
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        };
    }

    public toJSON(): AppServiceDTO {
        return this.toDTO();
    }
}
