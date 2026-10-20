import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-jwt-access-secret-32-chars-long!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-32-chars-long!';
process.env.GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || 'dummy-google-client-id';
process.env.GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || 'dummy-google-client-secret';
process.env.UMS_JWT_PUBLIC_KEY =
  process.env.UMS_JWT_PUBLIC_KEY ||
  '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Y8+test\n-----END PUBLIC KEY-----';

async function generate() {
  const { AppModule } = await import('../src/app.module.js');

  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('WMS API')
    .setDescription('Warehouse Management System API documentation')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = resolve(process.cwd(), 'contracts/openapi.json');
  mkdirSync(dirname(outputPath), { recursive: true });

  const sortedKeys = (obj: any): any => {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortedKeys(obj[key]);
    }
    return sorted;
  };

  const formattedJson = JSON.stringify(sortedKeys(document), null, 2) + '\n';
  writeFileSync(outputPath, formattedJson, 'utf-8');

  const pathCount = Object.keys(document.paths || {}).length;
  console.log(`[docs:openapi] generated ${outputPath} — ${pathCount} paths`);

  await app.close();
}

generate().catch((err) => {
  console.error('Failed to generate OpenAPI contract:', err);
  process.exit(1);
});
