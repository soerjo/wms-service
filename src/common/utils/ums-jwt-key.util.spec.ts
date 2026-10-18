import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadUmsPublicKey } from './ums-jwt-key.util.js';

describe('loadUmsPublicKey', () => {
  const mockPem =
    '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----';
  const mockPemEscaped =
    '-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\\n-----END PUBLIC KEY-----';

  it('should load inline PEM with escaped newlines', () => {
    const result = loadUmsPublicKey(mockPemEscaped, undefined);
    expect(result).toBe(mockPem);
  });

  it('should load inline PEM with actual newlines', () => {
    const result = loadUmsPublicKey(mockPem, undefined);
    expect(result).toBe(mockPem);
  });

  it('should load PEM from file path', () => {
    const tempFilePath = path.join(process.cwd(), 'test-public-key.pem');
    fs.writeFileSync(tempFilePath, mockPem, 'utf8');
    try {
      const result = loadUmsPublicKey(undefined, tempFilePath);
      expect(result).toBe(mockPem);
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  });

  it('should throw if both UMS_JWT_PUBLIC_KEY and UMS_JWT_PUBLIC_KEY_PATH are set', () => {
    expect(() => loadUmsPublicKey('key', 'path')).toThrow(
      /Cannot specify both/,
    );
  });

  it('should throw if neither is set', () => {
    expect(() => loadUmsPublicKey(undefined, undefined)).toThrow(
      /Must specify either/,
    );
  });

  it('should throw if file path does not exist', () => {
    expect(() => loadUmsPublicKey(undefined, 'non-existent-file.pem')).toThrow(
      /not found/,
    );
  });
});
