import { getOuraApiSandboxUserCollectionBaseUrl, getOuraApiUserCollectionBaseUrl } from '../api/endpoints';
import type { OuraResponseParams, RequestParams } from '../api/schemas/client';
import { SUPPORTED_SCOPES } from '../config/constants';

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

export function requestOuraData(
  request: RequestParams,
  bearerToken: string,
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
          Authorization: `Bearer ${bearerToken}`
        }
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Oura request failed (${res.status}) for type \"${type}\": ${body}`);
        }
        return (await res.json()) as OuraResponseParams;
      })
    );
  }
  return Promise.all(responses);
}
