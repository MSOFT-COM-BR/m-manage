import { extname } from 'node:path';
import { s3 } from '../config/s3';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ANY_FILE_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export interface UploadResult {
    filename: string;
    originalName: string;
    url: string;
    size: number;
    mimeType: string;
}

export interface UploadContent {
    stream: ReadableStream;
    type: string;
    size?: number;
}

// S019: storage é exclusivamente S3 — a API nunca persiste arquivo em disco local
function requireS3(): NonNullable<typeof s3> {
    if (!s3) {
        throw new Error(
            'Storage S3 não configurado (AWS_ENDPOINT/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY). Upload bloqueado.'
        );
    }
    return s3;
}

async function persist(file: File, subdir: string, filename: string, mimeType: string): Promise<void> {
    const key = `${subdir}/${filename}`;
    await requireS3().write(key, file, { type: mimeType });
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
        throw new Error(`Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB (máx ${MAX_SIZE_BYTES / 1024 / 1024}MB).`);
    }

    const filename = `${crypto.randomUUID()}${ext}`;
    await persist(file, subdir, filename, file.type);

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
        throw new Error(`Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB (máx ${MAX_ANY_FILE_SIZE_BYTES / 1024 / 1024}MB).`);
    }

    const ext = extname(file.name).toLowerCase();
    const filename = `${crypto.randomUUID()}${ext}`;
    const mimeType = file.type || 'application/octet-stream';
    await persist(file, subdir, filename, mimeType);

    return {
        filename,
        originalName: file.name,
        url: `/uploads/${subdir}/${filename}`,
        size: file.size,
        mimeType,
    };
}

/**
 * URL presignada de leitura direto no bucket (ex: para redirect 302).
 * Retorna null se o S3 não estiver configurado ou o caminho for inválido.
 */
export function presignUpload(rel: string, expiresIn = 3600): string | null {
    if (!s3 || rel.includes('..')) return null;
    return s3.presign(rel, { method: 'GET', expiresIn });
}

/**
 * Lê um upload direto do bucket pelo caminho relativo (ex: 'erp/bva/uuid.png').
 * Retorna null se o objeto não existir (ou se o S3 não estiver configurado).
 * Usa GET presignado em vez de stat(): o HEAD é instável atrás do proxy
 * (primeira chamada falha esporadicamente) e o GET único também evita uma
 * ida extra ao storage.
 */
export async function readUpload(rel: string): Promise<UploadContent | null> {
    if (!s3 || rel.includes('..')) return null;

    const url = s3.presign(rel, { method: 'GET', expiresIn: 300 });
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
        res = await fetch(url).catch(() => null);
    }
    if (!res || !res.ok || !res.body) return null;

    const size = Number(res.headers.get('content-length'));
    return {
        stream: res.body,
        type: res.headers.get('content-type') || 'application/octet-stream',
        size: Number.isFinite(size) ? size : undefined,
    };
}

export async function deleteUpload(urlPath: string): Promise<void> {
    // urlPath: /uploads/erp/bva/uuid.jpg → erp/bva/uuid.jpg
    const rel = urlPath.replace(/^\/?uploads\//, '');
    if (rel.includes('..')) {
        throw new Error('Caminho inválido');
    }
    await requireS3().file(rel).delete();
}
