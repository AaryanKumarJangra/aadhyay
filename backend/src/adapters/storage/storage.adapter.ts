import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';

/** S3-compatible object storage: Cloudflare R2, E2E Object Storage, MinIO (dev). */
@Injectable()
export class StorageAdapter {
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: env.S3_ACCESS_KEY ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY! } : undefined,
  });
  /** Presigned PUT. When `size` is given, Content-Length is signed too, so the upload must be exactly that size. */
  uploadUrl(key: string, mime: string, size?: number, ttlSec = 900) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: mime, ContentLength: size }), { expiresIn: ttlSec, signableHeaders: new Set(['content-type', ...(size ? ['content-length'] : [])]) });
  }
  downloadUrl(key: string, ttlSec = 3600, filename?: string) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ResponseContentDisposition: filename ? `inline; filename="${filename}"` : undefined }), { expiresIn: ttlSec });
  }
  async put(key: string, body: Buffer, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: mime }));
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}
