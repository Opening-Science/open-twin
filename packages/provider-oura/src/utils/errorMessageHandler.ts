export function errorResponseHandler(response: Response): string {
  switch (response.status) {
    case 400:
      return 'Bad Request (400) Explanation: The request contains query parameters that are invalid or incorrectly formatted.';
    case 401:
      return 'Unauthorized (401) Explanation: Invalid or expired authentication token.';
    case 403:
      return "Forbidden (403) Explanation: The requested resource requires additional permissions or the user's Oura subscription has expired.";
    case 429:
      return 'Too Many Requests (429) Explanation: Rate limit exceeded. See response headers for retry guidance.';
    default:
      return `Unexpected error (${response.status}): ${response.statusText}`;
  }
}
