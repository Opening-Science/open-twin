import { getOuraApiSandboxUserCollectionBaseUrl, getOuraApiUserCollectionBaseUrl } from '../api/endpoints';
import type { OuraResponseParams, RequestParams } from '../api/schemas/client';
import { SUPPORTED_SCOPES } from '../config/constants';
import type { TokenHandler } from './tokenUtils';

function buildQueryString(requestParams: Omit<RequestParams, 'types'>): string {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(requestParams)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      queryParams.append(key, value.join(','));
    } else {
      queryParams.append(key, String(value));
    }
  }

  return queryParams.toString();
}

export async function requestOuraData(
  request: RequestParams,
  tokenHandler: TokenHandler,
  sandbox: boolean = false
): Promise<OuraResponseParams[]> {
  const responses: Promise<OuraResponseParams>[] = [];
  const baseUrl = sandbox ? getOuraApiSandboxUserCollectionBaseUrl() : getOuraApiUserCollectionBaseUrl();
  for (const type of request.types) {
    if (!SUPPORTED_SCOPES.includes(type)) {
      throw new Error(`Unsupported request type: ${type}`);
    }
    const url = `${baseUrl}/${type}?${buildQueryString(request)}`;

    responses.push(
      fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await tokenHandler.getAccessToken()}`
        }
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Oura request failed (${res.status}) for type "${type}": ${body}`);
        }
        const jsonResponse = await res.json();
        return jsonResponse as OuraResponseParams;
      })
    );
  }
  return Promise.all(responses);
}
