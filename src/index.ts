import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { connectMongo } from './config/mongo';
import { presignUpload, readUpload } from './services/uploadService';
import { userRoutes } from './modules/users/user.controller';
import { authRoutes } from './routes/auth';
import { appRoutes } from './routes/apps';
import { catalogRoutes } from './routes/catalog';
import { credentialRoutes } from './routes/credentials';
import { healthtechRoutes } from './routes/healthtech';
import { taskRoutes } from './routes/tasks';
import { blogRoutes } from './routes/blogs';
import { contentRoutes } from './routes/content';
import { logRoutes } from './routes/logs';
import { mLeadsRequestRoutes } from './modules/mLeadsRequest';
import { productRoutes } from './modules/products';
import { erpRoutes } from './modules/erp';
import { mjsonRoutes } from './routes/mjson';
import { consultorasRoutes } from './routes/consultoras';
import { bvaOrderRoutes } from './routes/bvaOrders';
import { bvaProspectRoutes } from './routes/bvaProspects';
import { bvaCategoriaRoutes } from './routes/bvaCategorias';

// 1. Inicializa Conexão com Banco
await connectMongo();

const isDev = process.env.NODE_ENV !== 'production';

const PROD_ORIGINS = [
    'https://mirandasoft.com.br',
    'https://www.mirandasoft.com.br',
    'https://studiobva.com.br',
    'https://www.studiobva.com.br',
];

// Qualquer porta de localhost/127.0.0.1/*.local usado pelo stack local é liberada — são sempre
// origens de dev local, nunca de terceiros, então não há por que travar em uma
// whitelist fixa de portas (cada nova ferramenta local usa uma porta diferente).
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|m-manage\.local|m-bva\.local)(:\d+)?$/;

// 2. Cria a Aplicação
const app = new Elysia()
    .use(cors({
        origin: isDev
            ? true
            : (request: Request) => {
                const origin = request.headers.get('origin') ?? '';
                return PROD_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin);
            },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }))
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

    // 3. Registra os Módulos
    .use(userRoutes)
    .use(authRoutes)
    .use(appRoutes) // Msite Apps (Install/Verify)
    .use(catalogRoutes) // Marketplace Catalog
    .use(credentialRoutes) // Mcredential 
    .use(healthtechRoutes) // HealthTech Dashboard
    .use(taskRoutes) // MTasks
    .use(blogRoutes) // Blogs
    .use(contentRoutes) // Content Managementes)
    .use(logRoutes)
    .use(mLeadsRequestRoutes)
    .use(productRoutes)
    .use(erpRoutes)
    .use(mjsonRoutes)
    .use(consultorasRoutes)
    .use(bvaOrderRoutes)
    .use(bvaProspectRoutes)
    .use(bvaCategoriaRoutes);

const listenPort = Number(process.env.PORT);
app.listen(Number.isFinite(listenPort) && listenPort > 0 ? listenPort : 3000);
