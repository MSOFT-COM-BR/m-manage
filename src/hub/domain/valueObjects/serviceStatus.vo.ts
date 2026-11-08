import { InvalidServiceStatusError } from '../errors/hub.errors';

export type ServiceStatusValue = 'active' | 'inactive' | 'degraded' | 'maintenance';

/**
 * Value Object imutável representando o status operacional de um serviço no Hub.
 */
export class ServiceStatus {
    public static readonly ALLOWED_STATUSES: readonly ServiceStatusValue[] = [
        'active',
        'inactive',
        'degraded',
        'maintenance'
    ] as const;

    private readonly _value: ServiceStatusValue;

    private constructor(value: ServiceStatusValue) {
        this._value = value;
        Object.freeze(this);
    }

    /**
     * Factory method com validação estrita de invariantes.
     */
    public static create(value: string): ServiceStatus {
        if (!value || typeof value !== 'string') {
            throw new InvalidServiceStatusError(String(value), ServiceStatus.ALLOWED_STATUSES);
        }

        const normalized = value.trim().toLowerCase() as ServiceStatusValue;
        if (!ServiceStatus.isValid(normalized)) {
            throw new InvalidServiceStatusError(value, ServiceStatus.ALLOWED_STATUSES);
        }

        return new ServiceStatus(normalized);
    }

    public static isValid(value: string): value is ServiceStatusValue {
        return (ServiceStatus.ALLOWED_STATUSES as readonly string[]).includes(value);
    }

    public static active(): ServiceStatus {
        return new ServiceStatus('active');
    }

    public static inactive(): ServiceStatus {
        return new ServiceStatus('inactive');
    }

    public static degraded(): ServiceStatus {
        return new ServiceStatus('degraded');
    }

    public static maintenance(): ServiceStatus {
        return new ServiceStatus('maintenance');
    }

    public get value(): ServiceStatusValue {
        return this._value;
    }

    public isActive(): boolean {
        return this._value === 'active';
    }

    public isDegraded(): boolean {
        return this._value === 'degraded';
    }

    public isMaintenance(): boolean {
        return this._value === 'maintenance';
    }

    public isInactive(): boolean {
        return this._value === 'inactive';
    }

    /**
     * Determina se o serviço está disponível para roteamento/consumo (mesmo que com degradação).
     */
    public isOperational(): boolean {
        return this._value === 'active' || this._value === 'degraded';
    }

    public equals(other: ServiceStatus | null | undefined): boolean {
        if (!other) return false;
        return this._value === other.value;
    }

    public toString(): string {
        return this._value;
    }

    public toJSON(): string {
        return this._value;
    }
}
