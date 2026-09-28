// Query parameters can contain provider credentials. Store them encrypted,
// separately from the endpoint returned to the administration screen.
export function splitSmsEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !url.hostname.includes('.') || url.hostname.includes(':') ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(url.hostname)) {
    throw new Error('Use a public HTTPS SMS endpoint without embedded username or password.');
  }
  const query = url.search;
  url.search = '';
  return { endpoint: url.toString(), query };
}

export function smsRequestUrl(endpoint: string, secrets: Record<string, string>) {
  const parsed = splitSmsEndpoint(endpoint);
  const url = new URL(parsed.endpoint);
  url.search = secrets.endpointQuery || parsed.query;
  return url;
}
