import {
  OuraRequestParams,
  OuraResponseParams,
  RequestParams,
} from "../api/schemas/client";

function buildQueryString(requestParams: RequestParams): string {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(requestParams)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      queryParams.append(key, value.join(","));
    } else {
      queryParams.append(key, String(value));
    }
  }

  return queryParams.toString();
}

export function requestOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<OuraResponseParams> {
  const url = `https://api.ouraring.com/v2/usercollection/${request.type}?${buildQueryString(request)}`;

  return fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
  }).then((res) => res.json() as Promise<OuraResponseParams>);
}
