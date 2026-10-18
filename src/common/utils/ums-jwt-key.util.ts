import * as fs from 'node:fs';
import * as path from 'node:path';

export function loadUmsPublicKey(
  publicKeyEnv?: string,
  publicKeyPathEnv?: string,
): string {
  const hasKey = Boolean(publicKeyEnv && publicKeyEnv.trim().length > 0);
  const hasPath = Boolean(
    publicKeyPathEnv && publicKeyPathEnv.trim().length > 0,
  );

  if (hasKey && hasPath) {
    throw new Error(
      'Cannot specify both UMS_JWT_PUBLIC_KEY and UMS_JWT_PUBLIC_KEY_PATH. Choose one.',
    );
  }
  if (!hasKey && !hasPath) {
    throw new Error(
      'Must specify either UMS_JWT_PUBLIC_KEY or UMS_JWT_PUBLIC_KEY_PATH for UMS JWT verification.',
    );
  }

  if (hasKey) {
    // Replace literal '\n' string escapes with actual newlines if provided in single-line env vars
    return publicKeyEnv!.replace(/\\n/g, '\n');
  }

  const resolvedPath = path.isAbsolute(publicKeyPathEnv!)
    ? publicKeyPathEnv!
    : path.resolve(process.cwd(), publicKeyPathEnv!);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `UMS JWT public key file not found at path: ${resolvedPath}`,
    );
  }

  return fs.readFileSync(resolvedPath, 'utf8');
}
