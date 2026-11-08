/**
 * Use Case: RegisterServiceUseCase
 * 
 * Camada 2: Aplicação (Application Business Rules)
 * Orquestra a validação e o registro dinâmico de novos serviços verticais na topologia do Hub.
 * 
 * @module RegisterServiceUseCase
 * @version 0.10.56
 */

import {
    AppServiceEntity,
    IHubServiceRepository,
    InvalidServiceConfigError,
    SemanticVersion,
    ServiceAlreadyRegisteredError,
    ServiceStatus,
} from '../../domain';
import {
    RegisterServiceInputDto,
    RegisterServiceOutputDto,
} from '../dtos/registerService.dto';

/**
 * Caso de uso para registrar dinamicamente um serviço vertical no Hub Central.
 * Garante validações em nível de aplicação (idempotência, formato de chaves)
 * e delega invariantes corporativas às entidades e agregados de domínio.
 */
export class RegisterServiceUseCase {
    constructor(private readonly hubRepository: IHubServiceRepository) { }

    /**
     * Executa o fluxo de registro de um novo serviço no ecossistema.
     * 
     * @param input Dados de entrada do serviço a ser registrado
     * @returns Confirmação e representação serializada do serviço criado
     * @throws {InvalidServiceConfigError} Quando os parâmetros básicos são inválidos
     * @throws {ServiceAlreadyRegisteredError} Quando a chave ou prefixo já estão em uso
     */
    public async execute(input: RegisterServiceInputDto): Promise<RegisterServiceOutputDto> {
        this.validateInput(input);

        const normalizedKey = input.key.trim().toLowerCase();
        const normalizedPrefix = input.prefix.trim().replace(/\/+$/, '') || '/';

        // 1. Verificação de unicidade da chave no repositório
        const keyExists = await this.hubRepository.existsByKey(normalizedKey);
        if (keyExists) {
            throw new ServiceAlreadyRegisteredError(`key '${normalizedKey}'`);
        }

        // 2. Verificação de colisão de prefixo no repositório
        const existingPrefixService = await this.hubRepository.findByPrefix(normalizedPrefix);
        if (existingPrefixService) {
            throw new ServiceAlreadyRegisteredError(
                `prefix '${normalizedPrefix}' (conflict with '${existingPrefixService.key}')`
            );
        }

        // 3. Criação de Value Objects com validação intrínseca de invariantes
        const versionVo = SemanticVersion.create(input.version);
        const statusVo = ServiceStatus.create(input.status || 'active');

        // 4. Instanciação da Entidade de Domínio
        const serviceEntity = AppServiceEntity.create({
            key: normalizedKey,
            name: input.name,
            prefix: normalizedPrefix,
            version: versionVo,
            status: statusVo,
            description: input.description,
            tags: input.tags,
            metadata: input.metadata,
        });

        // 5. Atualização do Agregador Topológico (HubManifest)
        const manifest = await this.hubRepository.getManifest();
        manifest.registerService(serviceEntity);

        // 6. Persistência transacional através do Port de repositório
        await this.hubRepository.save(serviceEntity);
        await this.hubRepository.saveManifest(manifest);

        return {
            success: true,
            message: `Service '${serviceEntity.name}' (${serviceEntity.key}) registered successfully at route prefix '${serviceEntity.prefix}'.`,
            service: serviceEntity.toDTO(),
        };
    }

    /**
     * Validações de pré-condições da camada de aplicação
     */
    private validateInput(input: RegisterServiceInputDto): void {
        if (!input) {
            throw new InvalidServiceConfigError('RegisterService payload cannot be null or undefined.');
        }

        if (!input.key || typeof input.key !== 'string' || input.key.trim().length === 0) {
            throw new InvalidServiceConfigError('Service key is required and must be a non-empty string.');
        }

        // Validação de formato da chave (slug alfanumérico seguro)
        const keyRegex = /^[a-zA-Z0-9_-]+$/;
        if (!keyRegex.test(input.key.trim())) {
            throw new InvalidServiceConfigError(
                `Service key '${input.key}' contains invalid characters. Use alphanumeric, hyphens or underscores only.`
            );
        }

        if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
            throw new InvalidServiceConfigError('Service name is required and must be a non-empty string.');
        }

        if (!input.prefix || typeof input.prefix !== 'string' || input.prefix.trim().length === 0) {
            throw new InvalidServiceConfigError('Service prefix is required and must be a non-empty string.');
        }

        if (!input.version || typeof input.version !== 'string' || input.version.trim().length === 0) {
            throw new InvalidServiceConfigError('Service version is required and must follow SemVer format.');
        }
    }
}
