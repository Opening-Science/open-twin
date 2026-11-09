/**
 * WHAT: OAuthReader, the base for API readers behind OAuth 2.0, and OAuthTokenBridge, the token-handler shape it drives.
 * NOT:  Exchanges no token itself and persists nothing itself; the vendor handler exchanges, the host store keeps (D8).
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: a per-wearer tokenKey is required with no default, because several wearers can share one OAuth client.
 */
import { HealthDataReader } from './base';
import type { ReaderInput } from './types';
import type { Parser } from './utils/parser';

/** What the vendor token handlers (Oura, WHOOP) already expose. */
export interface OAuthTokenBridge {
  setTokens(
    tokens: { access_token: string; refresh_token: string; expires_in: number; token_type: 'bearer' },
    expiresAt?: number
  ): void;
  getTokens(): { tokens: { access_token: string; refresh_token?: string }; expiresAt: number } | undefined;
  /** Exchanges the authorization code the handler was built with. */
  authenticate(): Promise<void>;
}

export abstract class OAuthReader<C> extends HealthDataReader {
  protected abstract readonly configSchema: Parser<C>;
  protected abstract tokenHandlerFor(config: C, authorizationCode: string): OAuthTokenBridge;

  protected config: C | undefined;
  protected tokens: OAuthTokenBridge | undefined;
  private tokenKey: string | undefined;

  protected async onOpen(input: ReaderInput): Promise<void> {
    if (input.kind !== 'api' || input.sourceId !== this.descriptor.id) {
      throw this.fail(`An api input with sourceId "${this.descriptor.id}" is required`, 'validation', 'open');
    }

    const config = this.parseConfig(this.configSchema, input.config);

    if (!input.tokenKey)
      throw this.fail('A per-wearer tokenKey is required; there is no default', 'validation', 'open');

    const tokens = this.tokenHandlerFor(config, input.authorizationCode ?? '');

    const stored = await this.loadTokens(input.tokenKey);

    if (stored) {
      tokens.setTokens(
        {
          access_token: stored.accessToken,
          refresh_token: stored.refreshToken ?? '',
          expires_in: 0,
          token_type: 'bearer'
        },
        Date.parse(stored.expiresAt)
      );
    } else if (input.authorizationCode) {
      await tokens.authenticate();
    }

    this.config = config;
    this.tokens = tokens;
    this.tokenKey = input.tokenKey;
  }

  protected async onClose(): Promise<void> {
    const current = this.tokens?.getTokens();

    if (!current || !this.tokenKey) return;

    await this.saveTokens(this.tokenKey, {
      accessToken: current.tokens.access_token,
      refreshToken: current.tokens.refresh_token,
      expiresAt: new Date(current.expiresAt).toISOString()
    });
  }
}
