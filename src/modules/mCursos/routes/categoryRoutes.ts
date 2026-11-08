import { Elysia, t } from 'elysia';
import { Category } from '../models/Category';
import { mCursosAuth } from '../middleware/authGuard';

export const categoryRoutes = new Elysia({ prefix: '/categories' })
    .get('/', async () => {
        const categories = await Category.find().sort({ name: 1 });
        return { data: categories };
    })
    .get('/:slug', async ({ params: { slug } }) => {
        const category = await Category.findOne({ slug });
        if (!category) throw new Error('Category not found');
        return { data: category };
    })
    .use(mCursosAuth)
    // Protected routes (Admin only conceptually, but for now we rely on Active User)
    .post('/', async ({ body }: any) => {
        const category = await Category.create(body);
        return { data: category };
    }, {
        body: t.Object({
            name: t.String(),
            slug: t.String(),
            description: t.Optional(t.String()),
        })
    })
    .put('/:id', async ({ params: { id }, body }: any) => {
        const category = await Category.findByIdAndUpdate(id, body, { new: true });
        if (!category) throw new Error('Category not found');
        return { data: category };
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            slug: t.Optional(t.String()),
            description: t.Optional(t.String()),
        })
    })
    .delete('/:id', async ({ params: { id } }) => {
        await Category.findByIdAndDelete(id);
        return { success: true };
    });
