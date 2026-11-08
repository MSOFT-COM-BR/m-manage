import { AppServiceEntity } from '../entities/appService.entity';
import { HubManifestEntity } from '../entities/hubManifest.entity';

/**
 * Port Abstrato (Interface Pura de Repositório) para o Hub Central.
 * Define o contrato para persistência, recuperação e consulta da topologia de serviços
 * e manifesto do ecossistema, aderente à Clean Architecture (DIP - Dependency Inversion Principle).
 */
export interface IHubServiceRepository {
    /**
     * Persiste ou atualiza um serviço vertical no catálogo do Hub.
     */
    save(service: AppServiceEntity): Promise<void>;

    /**
     * Busca um serviço pela sua chave única de identificação (ex: 'm-com').
     */
    findByKey(key: string): Promise<AppServiceEntity | null>;

    /**
     * Busca um serviço pelo prefixo de rota configurado (ex: '/api/v1/finance').
     */
    findByPrefix(prefix: string): Promise<AppServiceEntity | null>;

    /**
     * Retorna todos os serviços verticais registrados.
     */
    findAll(): Promise<AppServiceEntity[]>;

    /**
     * Remove um serviço pelo identificador único. Retorna true se removido com sucesso.
     */
    delete(key: string): Promise<boolean>;

    /**
     * Verifica se existe um serviço registrado com a chave especificada.
     */
    existsByKey(key: string): Promise<boolean>;

    /**
     * Retorna a entidade agregada do Manifesto completo do Hub.
     */
    getManifest(): Promise<HubManifestEntity>;

    /**
     * Salva ou atualiza a fotografia do manifesto do Hub.
     */
    saveManifest(manifest: HubManifestEntity): Promise<void>;
}
