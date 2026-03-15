import axios from 'axios';

const APIFY_BASE_URL = 'https://api.apify.com/v2';

export const triggerApifyScraper = async ({ country, city, keywords, userId }) => {
  const actorId = process.env.APIFY_ACTOR_ID || 'apify/facebook-groups-scraper';
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    throw new Error('Apify API token not configured');
  }

  const input = {
    country,
    city: city || '',
    keywords,
    limit: 50,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL']
    }
  };

  try {
    const response = await axios.post(
      `${APIFY_BASE_URL}/acts/${actorId}/runs`,
      input,
      {
        params: {
          token: apiToken,
          webhooks: [
            {
              event: 'RUN.SUCCEEDED',
              url: `${process.env.WEBHOOK_BASE_URL}/api/scrape/webhook`
            }
          ]
        }
      }
    );

    return {
      data: {
        runId: response.data.data.id,
        status: response.data.data.status
      }
    };
  } catch (error) {
    console.error('Apify trigger error:', error.response?.data || error.message);
    throw new Error('Failed to trigger Apify scraper');
  }
};

export const getApifyRunStatus = async (runId) => {
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    throw new Error('Apify API token not configured');
  }

  try {
    const response = await axios.get(
      `${APIFY_BASE_URL}/actor-runs/${runId}`,
      {
        params: { token: apiToken }
      }
    );

    return {
      data: {
        status: response.data.data.status,
        finishedAt: response.data.data.finishedAt
      }
    };
  } catch (error) {
    console.error('Apify status error:', error.response?.data || error.message);
    throw new Error('Failed to get Apify run status');
  }
};

export const getApifyResults = async (runId) => {
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    throw new Error('Apify API token not configured');
  }

  try {
    const response = await axios.get(
      `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items`,
      {
        params: { token: apiToken }
      }
    );

    return { data: response.data };
  } catch (error) {
    console.error('Apify results error:', error.response?.data || error.message);
    throw new Error('Failed to get Apify results');
  }
};

export default { triggerApifyScraper, getApifyRunStatus, getApifyResults };
