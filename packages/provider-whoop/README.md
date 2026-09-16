# @open-twin/provider-whoop

WHOOP Developer API v2 to FHIR R4. Recovery, cycle (strain), and sleep metrics for a requested time window.

> **Note:** This package does not run the browser OAuth redirect. Your application must send the user to WHOOP, receive the authorization code, and pass it to `TokenHandler`.

## Installation

```bash
pnpm add @open-twin/provider-whoop
```

Register an app in the [WHOOP Developer Dashboard](https://developer.whoop.com/). WHOOP requires OAuth `state` to be **exactly 8 characters** — use `createWhoopOAuthState()`.

## Usage

```ts
import {
  TokenHandler,
  createWhoopOAuthState,
  getWhoopAuthorizationUrl,
  getWhoopData,
  getFhirBundleFromWhoopData,
  type WhoopAppConfig
} from '@open-twin/provider-whoop';

const config: WhoopAppConfig = {
  clientId: '…',
  clientSecret: '…',
  redirectUri: 'https://your.app/callback'
};

const state = createWhoopOAuthState();
const authorizeUrl = getWhoopAuthorizationUrl(config, state);
// redirect the user to authorizeUrl, then:

const tokenHandler = new TokenHandler(config, authorizationCode);
await tokenHandler.authenticate();

const window = { start: '2026-06-01T00:00:00.000Z', end: '2026-06-30T23:59:59.000Z' };

const { data, issues } = await getWhoopData(window, tokenHandler, { subjectKey: 'wearer-stable-id' });

const { bundle } = await getFhirBundleFromWhoopData(window, tokenHandler, {
  subjectKey: 'wearer-stable-id',
  timestamp: '2026-07-26T10:00:00Z'
});
```

Tokens are held in memory only; persist refresh tokens in your app if you need offline sync.

## Scope

v1 mappers: recovery (score, HRV, resting HR, SpO₂), cycle strain and average HR, sleep (performance, efficiency, time in bed). Workouts are not mapped yet.

## License

MIT
