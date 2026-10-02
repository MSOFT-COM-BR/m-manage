import { describe, expect, test } from 'bun:test';
import { toBlogListingItem } from '../src/routes/blogs';

describe('public blog listing', () => {
    test('excludes article content while keeping the card fields', () => {
        const item = toBlogListingItem({
            _id: 'blog-1',
            title: 'Post de exemplo',
            slug: 'post-de-exemplo',
            subtitle: 'Resumo curto',
            content: '<p>Conteúdo completo que não deve sair na listagem.</p>',
            description: 'Descrição para o card',
            author: 'Miranda Soft',
            imageUrl: 'https://cdn.example.test/post.jpg',
            tags: ['tecnologia'],
            category: 'Tecnologia',
            categories: ['Tecnologia'],
            featured: true,
            views: 42,
            createdAt: new Date('2026-10-02T12:00:00.000Z'),
            updatedAt: new Date('2026-10-02T12:00:00.000Z'),
        });

        expect(item).toMatchObject({
            _id: 'blog-1',
            title: 'Post de exemplo',
            slug: 'post-de-exemplo',
            description: 'Descrição para o card',
            categories: ['Tecnologia'],
        });
        expect(item).not.toHaveProperty('content');
    });
});
