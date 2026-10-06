import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asConnectorError } from '../../api/client';
import {
  assertFingerprintMatch,
  fingerprintSha256Hex,
  TLS_PIN_MISMATCH,
  TlsPinMismatchError,
  verifyPeerCertificate
} from '../../api/tls';

const here = dirname(fileURLToPath(import.meta.url));
const tlsSource = readFileSync(join(here, '../../api/tls.ts'), 'utf8');
const clientSource = readFileSync(join(here, '../../api/client.ts'), 'utf8');

describe('BodyLoop TLS pin', () => {
  it('source never sets NODE_TLS_REJECT_UNAUTHORIZED', () => {
    expect(tlsSource).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED\s*=/);
    expect(clientSource).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED\s*=/);
    expect(tlsSource).not.toContain('process.env.NODE_TLS_REJECT_UNAUTHORIZED');
    expect(clientSource).not.toContain('process.env.NODE_TLS_REJECT_UNAUTHORIZED');
  });

  it('pin mismatch throws TlsPinMismatchError with no fallback', () => {
    const actual = fingerprintSha256Hex(Buffer.from('peer-cert-a'));
    const expected = fingerprintSha256Hex(Buffer.from('peer-cert-b'));
    expect(actual).not.toBe(expected);
    expect(() => assertFingerprintMatch(actual, expected)).toThrow(TlsPinMismatchError);
    expect(() => verifyPeerCertificate({ raw: Buffer.from('peer-cert-a') }, expected)).toThrow(TLS_PIN_MISMATCH);
    const hashed = createHash('sha256').update('peer-cert-a').digest('hex');
    expect(hashed).toBe(actual);
    expect(() => verifyPeerCertificate({ raw: Buffer.from('peer-cert-a') }, actual)).not.toThrow();
  });

  it('wraps a pin mismatch as ConnectorError transport without the fingerprint', () => {
    const error = asConnectorError(new TlsPinMismatchError(), 'GET viatars');
    expect(error.code).toBe('transport');
    expect(error.operation).toBe('TLS pin');
    expect(String(error)).not.toMatch(/[0-9a-f]{64}/);
    expect(String(error)).not.toContain('BEGIN CERTIFICATE');
  });
});
