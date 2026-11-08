import { randomBytes, createHash } from 'crypto';
import { mApiToken, IApiToken } from '../../models/mApiToken';

export interface TokenValidationResult {
    valid: boolean;
    tokenDoc?: IApiToken;
    reason?: 'INVALID_FORMAT' | 'TOKEN_NOT_FOUND_OR_REVOKED' | 'TOKEN_EXPIRED' | 'INSUFFICIENT_SCOPE';
}

export interface GeneratedTokenResponse {
    token: string;
    record: IApiToken;
}

/**
 * Utilitário seguro para derivação de hash SHA-256 do token em texto plano.
 * O hash é unidirecional e impede que vazamentos do banco exponham tokens operacionais.
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Verifica se um conjunto de escopos concedidos cobre o escopo requerido.
 * Suporta correspondência exata, curinga global ('*') e curinga por namespace (ex: 'webhooks:*').
 */
export function matchesScope(grantedScopes: string[], requiredScope?: string): boolean {
    if (!requiredScope) {
        return true;
    }

    if (!Array.isArray(grantedScopes) || grantedScopes.length === 0) {
        return false;
    }

    if (grantedScopes.includes('*')) {
        return true;
    }

    if (grantedScopes.includes(requiredScope)) {
        return true;
    }

    // Suporte a namespace wildcard: 'webhooks:*' satisfaz 'webhooks:dispatch'
    return grantedScopes.some((scope) => {
        if (scope.endsWith(':*')) {
            const namespacePrefix = scope.slice(0, -1); // 'webhooks:'
            return requiredScope.startsWith(namespacePrefix);
        }
        return false;
    });
}

/**
 * Serviço de Gerenciamento Unificado de API Tokens para o ecossistema m-manage.
 * Projetado para suportar webhooks, n8n, automações externas e integrações entre microserviços.
 */
export class TokenService {
    /**
     * Gera um novo API Token criptograficamente seguro.
     * Retorna o token em texto plano APENAS nesta chamada. Em seguida, apenas o SHA-256 é retido.
     *
     * @param name Nome descritivo da integração (ex: "Integração n8n Padrão Engenharia")
     * @param scopes Lista de escopos concedidos (ex: ['webhooks:dispatch', 'webhooks:manage', 'leads:write'])
     * @param createdBy Identificador do usuário Master Admin criador
     * @param expiresInDays Dias de validade do token (opcional, null/undefined para token perpétuo até revogação)
     */
    public async generateToken(
        name: string,
        scopes: string[],
        createdBy: string,
        expiresInDays?: number
    ): Promise<GeneratedTokenResponse> {
        if (!name || name.trim().length === 0) {
            throw new Error('O nome do token é obrigatório.');
        }

        // Gera 24 bytes aleatórios (48 caracteres hex)
        const secretHex = randomBytes(24).toString('hex');
        const token = `mgt_live_${secretHex}`;
        const prefix = token.slice(0, 9); // 'mgt_live_'
        const tokenHash = hashToken(token);

        let expiresAt: Date | null = null;
        if (expiresInDays !== undefined && expiresInDays !== null && expiresInDays > 0) {
            expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
        }

        const record = await mApiToken.create({
            name: name.trim(),
            tokenHash,
            prefix,
            scopes: Array.isArray(scopes) ? scopes.map((s) => s.trim()) : [],
            status: 'active',
            expiresAt,
            createdBy: createdBy.trim(),
        });

        return {
            token,
            record,
        };
    }

    /**
     * Valida um token de API, verificando status ativo, expiração temporal e permissão de escopo.
     * Em caso de sucesso, registra o carimbo de data/hora em `lastUsedAt`.
     *
     * @param token Token em texto plano fornecido pelo cliente
     * @param requiredScope Escopo opcional exigido pelo endpoint ou ação
     */
    public async validateToken(
        token: string,
        requiredScope?: string
    ): Promise<TokenValidationResult> {
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            return { valid: false, reason: 'INVALID_FORMAT' };
        }

        const tokenHash = hashToken(token);

        const tokenDoc = await mApiToken.findOne({
            tokenHash,
            status: 'active',
        });

        if (!tokenDoc) {
            return { valid: false, reason: 'TOKEN_NOT_FOUND_OR_REVOKED' };
        }

        // Checagem de expiração temporal
        if (tokenDoc.expiresAt && tokenDoc.expiresAt.getTime() <= Date.now()) {
            return { valid: false, tokenDoc, reason: 'TOKEN_EXPIRED' };
        }

        // Checagem de escopo de permissão
        if (requiredScope && !matchesScope(tokenDoc.scopes, requiredScope)) {
            return { valid: false, tokenDoc, reason: 'INSUFFICIENT_SCOPE' };
        }

        // Atualização de auditoria operacional lastUsedAt (fire-and-forget seguro)
        const now = new Date();
        tokenDoc.lastUsedAt = now;
        await mApiToken.updateOne({ _id: tokenDoc._id }, { $set: { lastUsedAt: now } }).catch((err) => {
            console.error('[TokenService] Erro ao atualizar lastUsedAt:', err);
        });

        return {
            valid: true,
            tokenDoc,
        };
    }

    /**
     * Revoga um token de API pelo seu ID MongoDB.
     *
     * @param id ID do registro do token
     */
    public async revokeToken(id: string): Promise<boolean> {
        if (!id || typeof id !== 'string') {
            return false;
        }

        const result = await mApiToken.findByIdAndUpdate(
            id,
            { $set: { status: 'revoked' } },
            { new: true }
        );

        return Boolean(result);
    }

    /**
     * Lista todos os tokens de API cadastrados, ocultando rigorosamente o tokenHash.
     */
    public async listTokens(): Promise<IApiToken[]> {
        return await mApiToken.find()
            .select('-tokenHash')
            .sort({ createdAt: -1 });
    }

    /**
     * Busca um token específico por ID, garantindo que o tokenHash continue protegido.
     */
    public async getTokenById(id: string): Promise<IApiToken | null> {
        return await mApiToken.findById(id).select('-tokenHash');
    }
}

export const tokenService = new TokenService();
