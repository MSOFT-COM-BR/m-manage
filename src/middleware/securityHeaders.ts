import { Elysia } from 'elysia';

/**
 * Conjunto rigoroso de cabeçalhos de segurança HTTP recomendados pelo OWASP Top 10
 * para mitigação de XSS, Clickjacking, MIME sniffing, MIME confusion e forçamento de TLS.
 *
 * @version 0.10.58
 */
export const SECURITY_HEADERS: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';",
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
};

const DISCLOSURE_HEADERS_TO_REMOVE = [
    'x-powered-by',
    'X-Powered-By',
    'server',
    'Server',
];

/**
 * Injeta cabeçalhos defensivos e higieniza cabeçalhos de fingerprinting tecnológico
 * em mapas de headers (set.headers).
 */
export function applySecurityHeaders(headers: Record<string, any>): void {
    if (!headers) return;

    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        headers[key] = value;
    }

    for (const header of DISCLOSURE_HEADERS_TO_REMOVE) {
        delete headers[header];
    }
}

/**
 * Plugin Elysia para injeção global de cabeçalhos de segurança HTTP e
 * eliminação de fingerprinting tecnológico (ex: X-Powered-By).
 *
 * @version 0.10.58
 */
export const securityHeaders = new Elysia({ name: 'security-headers', seed: 'security-headers' })
    .headers(SECURITY_HEADERS)
    .onRequest(({ set }: any) => {
        applySecurityHeaders(set.headers);
    })
    .onAfterHandle({ as: 'global' }, ({ set }: any) => {
        applySecurityHeaders(set.headers);
    })
    .mapResponse({ as: 'global' }, ({ response, set }: any) => {
        applySecurityHeaders(set.headers);

        // Tratamento para respostas instanciadas como Response nativo
        if (response instanceof Response) {
            for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
                if (!response.headers.has(key)) {
                    response.headers.set(key, value);
                }
            }
            for (const header of DISCLOSURE_HEADERS_TO_REMOVE) {
                response.headers.delete(header);
            }
        }
        return response;
    });

export default securityHeaders;
