import { Elysia } from 'elysia';
import { mBlog } from '../models/mBlogs';
import { cache } from '../config/redis';
import { requireAuth } from '../middleware/requireAuth';

const CACHE_KEY_BLOGS = 'blogs:published';
const CACHE_TTL = 3600; // 1 hora

export const blogRoutes = new Elysia({ prefix: '/blogs' })
    .get('/', async () => {
        try {
            // Tenta pegar do Cache
            const cached = await cache.get(CACHE_KEY_BLOGS);
            if (cached) return { success: true, data: cached, fromCache: true };

            const blogs = await mBlog.find({ published: true }).sort({ createdAt: -1 });

            // Salva no Cache
            await cache.set(CACHE_KEY_BLOGS, blogs, CACHE_TTL);

            return { success: true, data: blogs };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    })
    .get('/all', async (ctx: any) => {
        // Admin route to fetch all, including drafts
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };
        try {
            const blogs = await mBlog.find().sort({ createdAt: -1 });
            return { success: true, data: blogs };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    })
    .get('/:slug', async ({ params }: any) => {
        try {
            const cacheKey = `blog:slug:${params.slug}`;
            const cached = await cache.get(cacheKey);
            if (cached) return { success: true, data: cached, fromCache: true };

            const blog = await mBlog.findOne({ slug: params.slug });
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
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };
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
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };
        const { params, body, set } = ctx;
        try {
            const blog = await mBlog.findByIdAndUpdate(params.id, body, { new: true });
            if (!blog) {
                set.status = 404;
                return { success: false, error: 'Post não encontrado' };
            }

            // Invalida caches
            await cache.del(CACHE_KEY_BLOGS);
            await cache.del(`blog:slug:${blog.slug}`);

            return { success: true, data: blog };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .delete('/:id', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };
        const { params, set } = ctx;
        try {
            const blog = await mBlog.findByIdAndDelete(params.id);
            if (!blog) {
                set.status = 404;
                return { success: false, error: 'Post não encontrado' };
            }

            // Invalida caches
            await cache.del(CACHE_KEY_BLOGS);
            if (blog.slug) await cache.del(`blog:slug:${blog.slug}`);

            return { success: true, message: 'Post removido' };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    });
