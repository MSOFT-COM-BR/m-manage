import { Elysia } from 'elysia';
import { mBlog } from '../models/mBlogs';
import { mBlogCategory } from '../models/mBlogCategory';
import { cache } from '../config/redis';
import { requireMasterAdmin } from '../middleware/requireAuth';

// Versioned to avoid serving the former full-article payload until its TTL expires.
const CACHE_KEY_BLOGS = 'blogs:published:listing:v1';
const CACHE_TTL = 3600; // 1 hora

// Categorias padrao semeadas na primeira consulta, quando a colecao esta vazia.
const DEFAULT_BLOG_CATEGORIES = ['Tecnologia', 'White Label', 'Produtividade', 'Design', 'Negócios'];

/** The public list only needs card metadata; full article HTML is fetched by slug. */
export const toBlogListingItem = (blog: Record<string, unknown>) => {
    const { content: _content, ...listing } = blog;
    return listing;
};

const ensureDefaultCategories = async () => {
    const count = await mBlogCategory.estimatedDocumentCount();
    if (count === 0) {
        await mBlogCategory.insertMany(DEFAULT_BLOG_CATEGORIES.map((name) => ({ name })));
    }
};

export const blogRoutes = new Elysia({ prefix: '/blogs' })
    .get('/', async () => {
        try {
            // Tenta pegar do Cache
            const cached = await cache.get(CACHE_KEY_BLOGS);
            if (cached) return { success: true, data: cached, fromCache: true };

            const blogs = await mBlog.find({ published: true })
                .select('-content')
                .sort({ createdAt: -1 })
                .lean();
            const listing = blogs.map(toBlogListingItem);

            // Salva no Cache
            await cache.set(CACHE_KEY_BLOGS, listing, CACHE_TTL);

            return { success: true, data: listing };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    })
    .get('/all', async (ctx: any) => {
        // Admin route to fetch all, including drafts
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        try {
            const blogs = await mBlog.find().sort({ createdAt: -1 });
            return { success: true, data: blogs };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    })
    .get('/categories', async ({ set }: any) => {
        try {
            await ensureDefaultCategories();
            const categories = await mBlogCategory.find().sort({ name: 1 });
            return { success: true, data: categories };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .post('/categories', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        const { body, set } = ctx;
        try {
            const name = String(body && body.name ? body.name : '').trim();
            if (!name || name.length > 80) {
                set.status = 400;
                return { success: false, error: 'Informe um nome de categoria válido (até 80 caracteres).' };
            }
            const existing = await mBlogCategory.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
            if (existing) {
                set.status = 409;
                return { success: false, error: 'Categoria já existe.' };
            }
            const category = await mBlogCategory.create({ name });
            set.status = 201;
            return { success: true, data: category };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .put('/categories/:id', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        const { params, body, set } = ctx;
        try {
            const name = String(body && body.name ? body.name : '').trim();
            if (!name || name.length > 80) {
                set.status = 400;
                return { success: false, error: 'Informe um nome de categoria válido (até 80 caracteres).' };
            }
            const duplicate = await mBlogCategory.findOne({
                _id: { $ne: params.id },
                name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
            });
            if (duplicate) {
                set.status = 409;
                return { success: false, error: 'Categoria já existe.' };
            }
            const category = await mBlogCategory.findByIdAndUpdate(params.id, { name }, { new: true });
            if (!category) {
                set.status = 404;
                return { success: false, error: 'Categoria não encontrada.' };
            }
            return { success: true, data: category };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .delete('/categories/:id', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        const { params, set } = ctx;
        try {
            const category = await mBlogCategory.findByIdAndDelete(params.id);
            if (!category) {
                set.status = 404;
                return { success: false, error: 'Categoria não encontrada.' };
            }
            return { success: true, message: 'Categoria removida' };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .get('/:slug', async ({ params }: any) => {
        try {
            const cacheKey = `blog:published:slug:v2:${params.slug}`;
            const cached = await cache.get(cacheKey);
            if (cached) return { success: true, data: cached, fromCache: true };

            const blog = await mBlog.findOne({ slug: params.slug, published: true });
            if (!blog) {
                return { success: false, error: 'Post não encontrado' };
            }
            // Increment views
            blog.views += 1;
            await blog.save();

            // Cache individual
            await cache.set(cacheKey, blog, CACHE_TTL);

            return { success: true, data: blog };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    })
    .post('/', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        const { body, set } = ctx;
        try {
            const newBlog = new mBlog(body);
            await newBlog.save();

            // Invalida cache de listagem
            await cache.del(CACHE_KEY_BLOGS);

            return { success: true, data: newBlog };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .put('/:id', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        const { params, body, set } = ctx;
        try {
            const previous = await mBlog.findById(params.id).select('slug');
            const blog = await mBlog.findByIdAndUpdate(params.id, body, { new: true });
            if (!blog) {
                set.status = 404;
                return { success: false, error: 'Post não encontrado' };
            }

            // Invalida caches
            await cache.del(CACHE_KEY_BLOGS);
            await cache.del(`blog:published:slug:v2:${blog.slug}`);
            if (previous?.slug && previous.slug !== blog.slug) await cache.del(`blog:published:slug:v2:${previous.slug}`);

            return { success: true, data: blog };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .delete('/:id', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        const { params, set } = ctx;
        try {
            const blog = await mBlog.findByIdAndDelete(params.id);
            if (!blog) {
                set.status = 404;
                return { success: false, error: 'Post não encontrado' };
            }

            // Invalida caches
            await cache.del(CACHE_KEY_BLOGS);
            if (blog.slug) await cache.del(`blog:published:slug:v2:${blog.slug}`);

            return { success: true, message: 'Post removido' };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    });
