import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { blogRoutes } from '../src/routes/blogs';
import { cache } from '../src/config/redis';
import { mBlog } from '../src/models/mBlogs';
import { mAuth } from '../src/models/mAuth';
import { signAccessToken } from '../src/config/jwt';

const app = new Elysia().use(blogRoutes);
const original = {
  cacheGet: cache.get,
  cacheSet: cache.set,
  findOne: mBlog.findOne,
  findById: mAuth.findById,
};

beforeAll(() => {
  (cache as any).get = async () => null;
  (cache as any).set = async () => undefined;
});

afterAll(() => {
  cache.get = original.cacheGet;
  cache.set = original.cacheSet;
  mBlog.findOne = original.findOne;
  mAuth.findById = original.findById;
});

test('public slug lookup asks only for a published article', async () => {
  let query: any;
  (mBlog as any).findOne = async (filter: any) => { query = filter; return null; };
  const response = await app.handle(new Request('http://localhost:3000/blogs/draft-slug'));
  expect((await response.json()).success).toBe(false);
  expect(query).toEqual({ slug: 'draft-slug', published: true });
});

test('article administration rejects guests and users without admin role', async () => {
  const unauthenticated = await app.handle(new Request('http://localhost:3000/blogs/all'));
  expect(unauthenticated.status).toBe(401);

  const token = signAccessToken({ sub: 'user-test', email: 'user@example.test', roles: ['user'], tokenVersion: 0 });
  (mAuth as any).findById = () => ({ select: async () => ({ roles: ['user'], status: 'active', tokenVersion: 0 }) });
  for (const [method, path] of [['GET', '/blogs/all'], ['POST', '/blogs'], ['PUT', '/blogs/post-1'], ['DELETE', '/blogs/post-1'], ['POST', '/blogs/categories']]) {
    const response = await app.handle(new Request(`http://localhost:3000${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ title: 'Não autorizado' }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).success).toBe(false);
  }
});
