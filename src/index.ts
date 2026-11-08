import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { connectMongo } from './config/mongo';
import { applySecurityHeaders, securityHeaders } from './middleware/securityHeaders';
import { presignUpload, readUpload } from './services/uploadService';
import {
    businessEduFashionRoutes,
    businessOperationsRoutes,
    ecosystemDomainRoutes,
    ensureCatalogSeeded,
    handleClientFormEvent,
    persistClientFormEvent,
    platformDomainRoutes,
} from './modules';
import { hubRoutes } from './hub';
import { redisQueue } from './services/redisQueue.service';

// 1. Inicializa Conexão com Banco
await connectMongo();
await ensureCatalogSeeded();

if (process.env.CLIENT_FORM_CONSUMER_ENABLED === 'true') {
    await redisQueue.consume('queue:client-forms', handleClientFormEvent);
}

const isDev = process.env.NODE_ENV !== 'production';

const PROD_ORIGINS = [
    'https://mirandasoft.com.br',
    'https://www.mirandasoft.com.br',
    'https://studiobva.mirandasoft.com.br',
    'https://studiobva.com.br',
    'https://padraoengenhariarn.com.br',
    'https://www.padraoengenhariarn.com.br',
];

// Qualquer porta de localhost/127.0.0.1/*.local usado pelo stack local é liberada — são sempre
// origens de dev local, nunca de terceiros, então não há por que travar em uma
// whitelist fixa de portas (cada nova ferramenta local usa uma porta diferente).
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|m-manage\.local|m-bva\.local|m-cursos\.local)(:\d+)?$/;

// 2. Cria a Aplicação
const app = new Elysia()
    .use(securityHeaders)
    .use(cors({
        origin: isDev
            ? true
            : (request: Request) => {
                const origin = request.headers.get('origin') ?? '';
                return PROD_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin);
            },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-Organization-Unit-Id'],
        credentials: true,
    }))
    .onError(({ code, error, set }) => {
        applySecurityHeaders(set.headers);

        const isProduction = process.env.NODE_ENV === 'production';

        switch (code) {
            case 'VALIDATION':
                set.status = 400;
                return {
                    success: false,
                    error: 'Erro de validação',
                    message: (error as any)?.message ?? 'Dados inválidos',
                };

            case 'NOT_FOUND':
                set.status = 404;
                return {
                    success: false,
                    error: 'Rota não encontrada',
                };

            case 'PARSE':
                set.status = 400;
                return {
                    success: false,
                    error: 'Erro ao processar corpo da requisição',
                };

            case 'INTERNAL_SERVER_ERROR':
            default:
                set.status = (error as any)?.status && typeof (error as any).status === 'number'
                    ? (error as any).status
                    : 500;

                // Observabilidade estruturada interna sem vazar detalhes para o cliente HTTP
                console.error(`[MManage Global Error Guard] [${code}]`, error);

                return {
                    success: false,
                    error: set.status === 404 ? 'Rota não encontrada' : 'Erro interno do servidor',
                    ...(!isProduction && {
                        code,
                        message: (error as any)?.message,
                        stack: (error as any)?.stack,
                    }),
                };
        }
    })
    .get('/', () => '🦊 MManage API is Running!')
    .get('/health', () => ({
        success: true,
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    }))

    // Uploads vivem no bucket S3 (S019). Imagens: redirect 302 presignado — o
    // navegador baixa direto do bucket, sem passar pela API. Anexos: streaming
    // pela API para manter o Content-Disposition: attachment (download forçado),
    // que a URL presignada não carrega.
    .get('/uploads/*', async ({ params, set }: any) => {
        try {
            const rel = String((params as any)['*']);

            if (!rel.includes('/attachments/')) {
                const url = presignUpload(rel);
                if (!url) {
                    set.status = 404;
                    return 'Not found';
                }
                set.status = 302;
                set.headers['Location'] = url;
                // URL presignada expira — o redirect não pode ficar cacheado além disso
                set.headers['Cache-Control'] = 'private, max-age=300';
                return '';
            }

            const content = await readUpload(rel);
            if (!content) {
                set.status = 404;
                return 'Not found';
            }
            return new Response(content.stream, {
                headers: {
                    'Content-Type': content.type,
                    'Content-Disposition': 'attachment',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                },
            });
        } catch {
            set.status = 404;
            return 'Not found';
        }
    })

    // 3. Registra os Domínios do Hub (Clean Architecture)
    .use(hubRoutes)
    .use(platformDomainRoutes)
    .use(ecosystemDomainRoutes)
    .use(businessEduFashionRoutes)
    .use(businessOperationsRoutes);

const listenPort = Number(process.env.PORT);
app.listen(Number.isFinite(listenPort) && listenPort > 0 ? listenPort : 3000);

const shutdown = async () => {
    await redisQueue.close();
    process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
