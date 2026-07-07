import { mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const UPLOADS_ROOT = join(process.cwd(), 'uploads');
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ANY_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export interface UploadResult {
    filename: string;
    originalName: string;
    url: string;
    size: number;
    mimeType: string;
}

export async function saveUpload(
    file: File,
    subdir: string,   // ex: 'erp/bva'
): Promise<UploadResult> {
    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) || !ALLOWED_EXTENSIONS.includes(ext)) {
        throw new Error(`Tipo não permitido: ${file.type} / ${ext}. Use jpeg, png, webp ou gif.`);
    }
    if (file.size > MAX_SIZE_BYTES) {
        throw new Error(`Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB (máx 5MB).`);
    }

    const dir = join(UPLOADS_ROOT, subdir);
    await mkdir(dir, { recursive: true });

    const filename = `${crypto.randomUUID()}${ext}`;
    const dest = join(dir, filename);

    await Bun.write(dest, file);

    return {
        filename,
        originalName: file.name,
        url: `/uploads/${subdir}/${filename}`,
        size: file.size,
        mimeType: file.type,
    };
}

export async function saveAnyUpload(
    file: File,
    subdir: string,
): Promise<UploadResult> {
    if (file.size > MAX_ANY_FILE_SIZE_BYTES) {
        throw new Error(`Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB (máx 25MB).`);
    }

    const dir = join(UPLOADS_ROOT, subdir);
    await mkdir(dir, { recursive: true });

    const ext = extname(file.name).toLowerCase();
    const filename = `${crypto.randomUUID()}${ext}`;
    const dest = join(dir, filename);

    await Bun.write(dest, file);

    return {
        filename,
        originalName: file.name,
        url: `/uploads/${subdir}/${filename}`,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
    };
}

export async function deleteUpload(urlPath: string): Promise<void> {
    // urlPath: /uploads/erp/bva/uuid.jpg → uploads/erp/bva/uuid.jpg
    const rel = urlPath.replace(/^\//, '');
    const abs = join(process.cwd(), rel);
    // Garante que está dentro de uploads/
    if (!abs.startsWith(join(process.cwd(), 'uploads'))) {
        throw new Error('Caminho inválido');
    }
    const f = Bun.file(abs);
    if (await f.exists()) {
        await f.delete?.() ?? require('node:fs').unlinkSync(abs);
    }
}
