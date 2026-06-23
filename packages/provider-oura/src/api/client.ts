import { requestOuraData } from "../utils/clientUtils";
import { getOuraOauthTokenUrl } from "./endpoints";
import {
  TokenRequest,
  TokenResponse,
  TokenResponseSchema,
} from "./schemas/auth";
import { RequestParams } from "./schemas/client";

export async function getAccessToken(
  request: TokenRequest,
): Promise<TokenResponse> {
  const token_url = getOuraOauthTokenUrl();
  const response = await fetch(token_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(request).toString(),
  }).then((res) => res.json());

  return TokenResponseSchema.parse(response);
}

export async function refreshAccessToken(
  client_id: string,
  refresh_token: string,
): Promise<TokenResponse> {
  const token_url = getOuraOauthTokenUrl();
  const response = await fetch(token_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id,
      grant_type: "refresh_token",
      refresh_token,
    }).toString(),
  }).then((res) => res.json());

  return TokenResponseSchema.parse(response);
}

export async function getUserCollection(requestParams: RequestParams) {
  const response = await requestOuraData(
    requestParams,
    "YOUR_BEARER_TOKEN_HERE",
  );
  return response;
}
