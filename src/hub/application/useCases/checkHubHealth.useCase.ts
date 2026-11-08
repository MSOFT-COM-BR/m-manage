/**
 * Use Case: CheckHubHealthUseCase
 * 
 * Camada 2: Aplicação (Application Business Rules)
 * Consolida a integridade global do cluster, partições de domínio e dependências externas (DB, RabbitMQ).
 * 
 * @module CheckHubHealthUseCase
 * @version 0.10.56
 */

import {
    HubHealthStatus,
    IHubServiceRepository,
} from '../../domain';
import {
    CheckHubHealthInputDto,
    CheckHubHealthOutputDto,
    DatabaseHealthDetailDto,
    RabbitMQHealthDetailDto,
} from '../dtos/checkHubHealth.dto';

/**
 * Caso de uso responsável pela agregação e cálculo do relatório de integridade (Health Check).
 * Avalia o estado de funcionamento do cluster, as partições de domínio corporativas
 * e a saúde das dependências externas vitais (MongoDB/Mongoose, RabbitMQ Broker).
 */
export class CheckHubHealthUseCase {
    constructor(private readonly hubRepository: IHubServiceRepository) { }

    /**
     * Executa a consolidação de integridade do Hub.
     * 
     * @param input Parâmetros contendo o estado atual das dependências de infraestrutura
     * @returns Relatório consolidado com status global, dependências e partições
     */
    public async execute(input: CheckHubHealthInputDto = {}): Promise<CheckHubHealthOutputDto> {
        const manifest = await this.hubRepository.getManifest();
        const baseDto = manifest.toDTO();

        // 1. Avaliação da dependência: Banco de Dados
        const dbInput = input.dependencies?.database;
        const isDbConnected = dbInput ? Boolean(dbInput.isConnected && (dbInput.readyState === undefined || dbInput.readyState === 1)) : true;
        const dbStatus: DatabaseHealthDetailDto = {
            connected: isDbConnected,
            status: isDbConnected ? 'connected' : 'disconnected',
            host: dbInput?.host,
            database: dbInput?.database,
            latencyMs: dbInput?.latencyMs,
            error: dbInput?.error,
        };

        // 2. Avaliação da dependência: RabbitMQ Broker
        const rmqInput = input.dependencies?.rabbitmq;
        let rmqStatus: RabbitMQHealthDetailDto | undefined;
        if (rmqInput) {
            const isRmqConnected = Boolean(rmqInput.isConnected);
            rmqStatus = {
                connected: isRmqConnected,
                status: isRmqConnected ? 'connected' : (rmqInput.status === 'degraded' ? 'degraded' : 'disconnected'),
                latencyMs: rmqInput.latencyMs,
                error: rmqInput.error,
            };
        }

        // 3. Avaliação dos domínios estruturais
        const platformDomain = manifest.platformDomain;
        const isPlatformActive = platformDomain.status.isActive();
        const platformHealthStatus: HubHealthStatus = isPlatformActive ? 'healthy' : 'degraded';

        const ecosystemDomain = manifest.ecosystemDomain;
        const isEcosystemActive = ecosystemDomain.status.isActive();
        const ecosystemHealthStatus: HubHealthStatus = isEcosystemActive ? 'healthy' : 'degraded';

        // 4. Avaliação dos serviços verticais registrados
        const servicesList = manifest.listServices();
        const totalServices = servicesList.length;
        const activeServices = servicesList.filter((s) => s.status.isActive()).length;

        let servicesHealthStatus: HubHealthStatus = 'healthy';
        if (totalServices > 0) {
            if (activeServices === 0) {
                servicesHealthStatus = 'unhealthy';
            } else if (activeServices < totalServices) {
                servicesHealthStatus = 'degraded';
            }
        }

        const simplifiedServices: Record<string, { status: string; version: string }> = {};
        for (const [key, svc] of Object.entries(baseDto.domains.services)) {
            simplifiedServices[key] = {
                status: svc.status,
                version: svc.version,
            };
        }

        // 5. Cálculo consolidado de status do Cluster (Overall Status)
        const domainAggregateHealth = manifest.calculateHealth();
        let overallStatus: HubHealthStatus = domainAggregateHealth;

        // Se o banco estiver desconectado, degrada o status do cluster
        if (!isDbConnected) {
            overallStatus = 'degraded';
        }

        // Se RabbitMQ estiver presente e desconectado, degrada o status geral
        if (rmqStatus && !rmqStatus.connected && overallStatus === 'healthy') {
            overallStatus = 'degraded';
        }

        // Se ambos DB e RabbitMQ caíram, o cluster está unhealthy
        if (!isDbConnected && rmqStatus && !rmqStatus.connected) {
            overallStatus = 'unhealthy';
        }

        return {
            success: overallStatus !== 'unhealthy',
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: manifest.uptimeSeconds,
            version: manifest.version.toString(),
            environment: manifest.environment,
            dependencies: {
                database: dbStatus,
                ...(rmqStatus ? { rabbitmq: rmqStatus } : {}),
            },
            domains: {
                platform: {
                    status: platformHealthStatus,
                    totalUnits: platformDomain.modules.length,
                    activeUnits: isPlatformActive ? platformDomain.modules.length : 0,
                    modules: [...platformDomain.modules],
                },
                ecosystem: {
                    status: ecosystemHealthStatus,
                    totalUnits: ecosystemDomain.modules.length,
                    activeUnits: isEcosystemActive ? ecosystemDomain.modules.length : 0,
                    modules: [...ecosystemDomain.modules],
                },
                services: {
                    status: servicesHealthStatus,
                    totalUnits: totalServices,
                    activeUnits: activeServices,
                    services: simplifiedServices,
                },
            },
        };
    }
}
