/**
 * Domain Errors - Enterprise Business Rules
 * Hub Central de Aplicações e Serviços
 * 
 * Exceções puras de domínio, desacopladas de frameworks HTTP ou ORM.
 */

export abstract class DomainError extends Error {
    public readonly timestamp: Date;

    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date();
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Lançada quando há tentativa de registrar um serviço já existente (chave ou prefixo duplicado).
 */
export class ServiceAlreadyRegisteredError extends DomainError {
    constructor(identifier: string, details?: Record<string, unknown>) {
        super(
            `Service with identifier '${identifier}' is already registered in the Hub topology.`,
            'SERVICE_ALREADY_REGISTERED',
            details
        );
    }
}

/**
 * Lançada quando um serviço não é encontrado no catálogo do Hub.
 */
export class ServiceNotFoundError extends DomainError {
    constructor(serviceKey: string, details?: Record<string, unknown>) {
        super(
            `Service with key '${serviceKey}' was not found in the Hub registry.`,
            'SERVICE_NOT_FOUND',
            details
        );
    }
}

/**
 * Lançada quando a configuração de um serviço viola invariantes de domínio.
 */
export class InvalidServiceConfigError extends DomainError {
    constructor(reason: string, details?: Record<string, unknown>) {
        super(
            `Invalid service configuration: ${reason}`,
            'INVALID_SERVICE_CONFIG',
            details
        );
    }
}

/**
 * Lançada quando uma versão semântica é inválida.
 */
export class InvalidSemanticVersionError extends DomainError {
    constructor(rawVersion: string) {
        super(
            `Value '${rawVersion}' does not conform to semantic versioning format (e.g. 1.0.0 or v1.0).`,
            'INVALID_SEMANTIC_VERSION',
            { rawVersion }
        );
    }
}

/**
 * Lançada quando o estado ou status de um serviço é inválido.
 */
export class InvalidServiceStatusError extends DomainError {
    constructor(rawStatus: string, allowedStatuses: readonly string[]) {
        super(
            `Status '${rawStatus}' is invalid. Allowed statuses: ${allowedStatuses.join(', ')}`,
            'INVALID_SERVICE_STATUS',
            { rawStatus, allowedStatuses }
        );
    }
}
