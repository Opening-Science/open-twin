/**
 * WHAT: Per-client TLS certificate fingerprint pin for the BodyLoop HTTPS agent.
 * NOT:  Must not set NODE_TLS_REJECT_UNAUTHORIZED; must not persist TOFU state; mapping stays in mappers.
 * GOVERNED BY: DECISIONS.md#d8
 * CORRECTNESS: SHA-256 of the peer certificate DER (Node tls.PeerCertificate.raw); mismatch is TlsPinMismatchError.
 */
import { createHash } from 'node:crypto';
import https from 'node:https';
import type { ConnectionOptions } from 'node:tls';
import tls from 'node:tls';

/**
 * Per-connection TLS pin. Never set NODE_TLS_REJECT_UNAUTHORIZED.
 * Self-signed scanner certs are accepted only when the SHA-256 of cert.raw matches.
 */

export const TLS_PIN_MISMATCH = 'vitronic-tls-pin-mismatch';

export class TlsPinMismatchError extends Error {
  readonly code = TLS_PIN_MISMATCH;
  constructor() {
    super(TLS_PIN_MISMATCH);
    this.name = 'TlsPinMismatchError';
  }
}

export const fingerprintSha256Hex = (der: Buffer | Uint8Array): string =>
  createHash('sha256').update(der).digest('hex');

export const peerFingerprint = (cert: { raw?: Buffer } | undefined): string => {
  if (!cert?.raw) throw new TlsPinMismatchError();
  return fingerprintSha256Hex(cert.raw);
};

export const assertFingerprintMatch = (actual: string, expected: string): void => {
  if (actual !== expected) throw new TlsPinMismatchError();
};

export const verifyPeerCertificate = (cert: { raw?: Buffer } | undefined, expected: string): void => {
  assertFingerprintMatch(peerFingerprint(cert), expected);
};

export type TlsPinMode = Readonly<{ kind: 'pin'; fingerprintSha256: string }>;

/**
 * checkServerIdentity is the documented verification hook. rejectUnauthorized is
 * false because the scanner cert is self-signed; the pin is the trust anchor.
 * createConnection also verifies after handshake so a mismatch cannot fall through
 * when Node ignores identity errors under rejectUnauthorized: false.
 */
export function createPinnedHttpsAgent(mode: TlsPinMode): https.Agent {
  const agent = new https.Agent({
    rejectUnauthorized: false,
    checkServerIdentity: (_host, cert) => {
      try {
        verifyPeerCertificate(cert, mode.fingerprintSha256);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error : new TlsPinMismatchError();
      }
    }
  });

  agent.createConnection = (options, callback) => {
    const socket = tls.connect(
      {
        ...(options as ConnectionOptions),
        rejectUnauthorized: false,
        checkServerIdentity: (_host, cert) => {
          try {
            verifyPeerCertificate(cert, mode.fingerprintSha256);
            return undefined;
          } catch (error) {
            return error instanceof Error ? error : new TlsPinMismatchError();
          }
        }
      },
      () => {
        try {
          const fp = peerFingerprint(socket.getPeerCertificate(true));
          assertFingerprintMatch(fp, mode.fingerprintSha256);
          callback?.(null, socket);
        } catch (error) {
          socket.destroy();
          const err = error instanceof TlsPinMismatchError ? error : new TlsPinMismatchError();
          callback?.(err, socket);
        }
      }
    );
    socket.on('error', (error) => {
      callback?.(error, socket);
    });
    return socket;
  };

  return agent;
}

export type PinnedRequestInit = Readonly<{
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array;
}>;

export type PinnedRequestResult = Readonly<{
  status: number;
  headers: Headers;
  body: Buffer;
}>;

const asTlsError = (error: unknown): Error => {
  if (error instanceof TlsPinMismatchError) return error;
  if (error instanceof Error) {
    if (error.name === 'TlsPinMismatchError' || error.message === TLS_PIN_MISMATCH) {
      return new TlsPinMismatchError();
    }
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof TlsPinMismatchError) return cause;
  }
  return error instanceof Error ? error : new Error(String(error));
};

export function pinnedRequest(url: string, init: PinnedRequestInit, mode: TlsPinMode): Promise<PinnedRequestResult> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('vitronic-tls-https-required');
  }
  const agent = createPinnedHttpsAgent(mode);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? 'GET',
        headers: init.headers,
        agent
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: new Headers(res.headers as Record<string, string>),
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on('error', (error) => {
      reject(asTlsError(error));
    });
    if (init.body) req.write(init.body);
    req.end();
  });
}
