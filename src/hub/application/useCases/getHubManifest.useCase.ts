/**
 * Use Case: GetHubManifestUseCase
 * 
 * Camada 2: Aplicação (Application Business Rules)
 * Orquestra a obtenção e estruturação do manifesto do Hub Central a partir do repositório de domínio.
 * 
 * @module GetHubManifestUseCase
 * @version 0.10.56
 */

import { IHubServiceRepository } from '../../domain';
import {
    GetHubManifestInputDto,
    GetHubManifestOutputDto,
    HubServiceManifestItemDto,
} from '../dtos/getHubManifest.dto';

/**
 * Caso de uso responsável por obter o manifesto topológico e operacional do Hub Central.
 * Adere estritamente ao Princípio de Inversão de Dependência (DIP) recebendo IHubServiceRepository.
 */
export class GetHubManifestUseCase {
    constructor(private readonly hubRepository: IHubServiceRepository) { }

    /**
     * Executa a orquestração do manifesto com base nos parâmetros fornecidos.
     * 
     * @param input Parâmetros opcionais de filtragem e granularidade
     * @returns DTO estruturado com metadados do hub e partição de domínios
     */
    public async execute(input: GetHubManifestInputDto = {}): Promise<GetHubManifestOutputDto> {
        const {
            includeInactive = true,
            tag,
            statusFilter,
        } = input;

        // Recupera o agregador de manifesto a partir da abstração do repositório
        const manifest = await this.hubRepository.getManifest();
        const baseDto = manifest.toDTO();

        // Filtragem declarativa sobre a coleção de serviços verticais
        const filteredServices: Record<string, HubServiceManifestItemDto> = {};

        for (const [key, svc] of Object.entries(baseDto.domains.services)) {
            // Regra 1: Exclusão de inativos caso includeInactive seja false
            if (!includeInactive && (svc.status === 'inactive' || svc.status === 'maintenance')) {
                continue;
            }

            // Regra 2: Filtragem por tag específica
            if (tag) {
                const normalizedTag = tag.trim().toLowerCase();
                const serviceTags = svc.tags?.map((t) => t.toLowerCase()) || [];
                if (!serviceTags.includes(normalizedTag)) {
                    continue;
                }
            }

            // Regra 3: Filtragem por status específico
            if (statusFilter) {
                const normalizedStatus = statusFilter.trim().toLowerCase();
                if (svc.status.toLowerCase() !== normalizedStatus) {
                    continue;
                }
            }

            filteredServices[key] = {
                name: svc.name,
                prefix: svc.prefix,
                status: svc.status,
                version: svc.version,
                description: svc.description,
                tags: svc.tags ? [...svc.tags] : [],
                metadata: svc.metadata ? { ...svc.metadata } : {},
            };
        }

        return {
            hub: {
                name: baseDto.hub.name,
                version: baseDto.hub.version,
                environment: baseDto.hub.environment,
                status: baseDto.hub.status,
                uptime: baseDto.hub.uptime,
                timestamp: baseDto.hub.timestamp,
            },
            domains: {
                platform: {
                    name: baseDto.domains.platform.name,
                    prefix: baseDto.domains.platform.prefix,
                    modules: [...baseDto.domains.platform.modules],
                    status: baseDto.domains.platform.status,
                    description: baseDto.domains.platform.description,
                },
                ecosystem: {
                    name: baseDto.domains.ecosystem.name,
                    prefix: baseDto.domains.ecosystem.prefix,
                    modules: [...baseDto.domains.ecosystem.modules],
                    status: baseDto.domains.ecosystem.status,
                    description: baseDto.domains.ecosystem.description,
                },
                services: filteredServices,
            },
        };
    }
}
