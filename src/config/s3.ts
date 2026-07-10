import { S3Client } from 'bun';

const endpoint = process.env.AWS_ENDPOINT;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

export const S3_BUCKET = process.env.AWS_BUCKET || 'm-manage';

/**
 * Cliente S3 (MinIO em storage.mirandasoft.com.br). Quando as credenciais não
 * estão configuradas, `s3` é null e o uploadService usa o disco local (dev).
 */
export const s3: S3Client | null =
    endpoint && accessKeyId && secretAccessKey
        ? new S3Client({
            endpoint,
            bucket: S3_BUCKET,
            region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
            accessKeyId,
            secretAccessKey,
            // Bun usa path-style por padrão; só ativa virtual-hosted se pedirem explicitamente
            virtualHostedStyle: process.env.AWS_USE_PATH_STYLE_ENDPOINT === 'false',
        })
        : null;
