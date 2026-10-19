// Read-only GraphQL queries. Never return credentials or upstream error text.
async function queryBuffer(token, query, fetcher) {
  const response = await fetcher('https://api.buffer.com', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000)
  });
  if (response.status === 401 || response.status === 403) throw new Error('buffer_auth_failed');
  if (response.status === 429) throw new Error('buffer_rate_limited');
  if (!response.ok) throw new Error('buffer_unavailable');
  const body = await response.json();
  if (body.errors?.length || !body.data) throw new Error('buffer_response_invalid');
  return body.data;
}

export async function checkBufferConnection(env, fetcher = fetch) {
  if (!env.BUFFER_API_TOKEN) return { configured: false, sendingEnabled: false, channels: [] };
  const data = await queryBuffer(env.BUFFER_API_TOKEN, 'query { account { organizations { id name } } }', fetcher);
  const organizations = data.account?.organizations;
  if (!Array.isArray(organizations) || organizations.length > 5) throw new Error('buffer_organization_selection_required');
  const channels = [];
  for (const organization of organizations) {
    if (typeof organization.id !== 'string' || !organization.id) throw new Error('buffer_response_invalid');
    const result = await queryBuffer(env.BUFFER_API_TOKEN,
      'query { channels(input: { organizationId: ' + JSON.stringify(organization.id) + ' }) { id name service isQueuePaused } }', fetcher);
    if (!Array.isArray(result.channels)) throw new Error('buffer_response_invalid');
    for (const channel of result.channels) {
      if (!['twitter', 'threads'].includes(channel.service)) continue;
      if (typeof channel.id !== 'string' || typeof channel.name !== 'string') throw new Error('buffer_response_invalid');
      channels.push({ id: channel.id, name: channel.name, platform: channel.service === 'twitter' ? 'x' : 'threads', queuePaused: channel.isQueuePaused === true });
    }
  }
  return { configured: true, sendingEnabled: env.SOCIAL_AUTO_ENABLED === 'true', channels };
}
