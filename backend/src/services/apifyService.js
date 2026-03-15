import axios from 'axios';

const APIFY_BASE_URL = 'https://api.apify.com/v2';

export const AVAILABLE_ACTORS = {
  FACEBOOK_POSTS: 'apify/facebook-posts-scraper',
  FACEBOOK_PAGES: 'apify/facebook-pages-scraper',
  FACEBOOK_COMMENTS: 'apify/facebook-comments-scraper',
  FACEBOOK_GROUPS: 'apify/facebook-groups-scraper'
};

const MAX_GROUPS = parseInt(process.env.SCRAPE_MAX_GROUPS) || 20;
const MAX_POSTS_PER_GROUP = parseInt(process.env.SCRAPE_MAX_POSTS_PER_GROUP) || 50;

const getApiToken = () => {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    throw new Error('Apify API token not configured');
  }
  return apiToken;
};

const getWebhookUrl = (stage) => {
  return `${process.env.WEBHOOK_BASE_URL}/api/scrape/webhook/${stage}`;
};

export const triggerGroupsScraper = async ({ country, city, keywords, userId }) => {
  const apiToken = getApiToken();
  const actor = AVAILABLE_ACTORS.FACEBOOK_GROUPS;

  const input = {
    country,
    city: city || '',
    keywords,
    limit: MAX_GROUPS,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL']
    }
  };

  try {
    const response = await axios.post(
      `${APIFY_BASE_URL}/acts/${actor}/runs`,
      input,
      {
        params: {
          token: apiToken,
          webhooks: [
            {
              event: 'RUN.SUCCEEDED',
              url: getWebhookUrl('groups')
            },
            {
              event: 'RUN.FAILED',
              url: getWebhookUrl('groups')
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
    console.error('Groups scraper trigger error:', error.response?.data || error.message);
    throw new Error('Failed to trigger groups scraper');
  }
};

export const triggerPostsScraper = async ({ groupUrls, groupIds, userId }) => {
  const apiToken = getApiToken();
  const actor = AVAILABLE_ACTORS.FACEBOOK_POSTS;

  const input = {
    groupUrls,
    limit: MAX_POSTS_PER_GROUP,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL']
    }
  };

  try {
    const response = await axios.post(
      `${APIFY_BASE_URL}/acts/${actor}/runs`,
      input,
      {
        params: {
          token: apiToken,
          webhooks: [
            {
              event: 'RUN.SUCCEEDED',
              url: getWebhookUrl('posts')
            },
            {
              event: 'RUN.FAILED',
              url: getWebhookUrl('posts')
            }
          ]
        }
      }
    );

    return {
      data: {
        runId: response.data.data.id,
        status: response.data.data.status,
        groupIds
      }
    };
  } catch (error) {
    console.error('Posts scraper trigger error:', error.response?.data || error.message);
    throw new Error('Failed to trigger posts scraper');
  }
};

export const triggerCommentsScraper = async ({ postUrls, postIds, userId }) => {
  const apiToken = getApiToken();
  const actor = AVAILABLE_ACTORS.FACEBOOK_COMMENTS;

  const input = {
    postUrls,
    limit: 100,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL']
    }
  };

  try {
    const response = await axios.post(
      `${APIFY_BASE_URL}/acts/${actor}/runs`,
      input,
      {
        params: {
          token: apiToken,
          webhooks: [
            {
              event: 'RUN.SUCCEEDED',
              url: getWebhookUrl('comments')
            },
            {
              event: 'RUN.FAILED',
              url: getWebhookUrl('comments')
            }
          ]
        }
      }
    );

    return {
      data: {
        runId: response.data.data.id,
        status: response.data.data.status,
        postIds
      }
    };
  } catch (error) {
    console.error('Comments scraper trigger error:', error.response?.data || error.message);
    throw new Error('Failed to trigger comments scraper');
  }
};

export const triggerApifyScraper = async ({ country, city, keywords, userId, actorId }) => {
  const actor = actorId || process.env.APIFY_ACTOR_ID || AVAILABLE_ACTORS.FACEBOOK_GROUPS;
  const apiToken = getApiToken();

  const input = {
    country,
    city: city || '',
    keywords,
    limit: MAX_GROUPS,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL']
    }
  };

  try {
    const response = await axios.post(
      `${APIFY_BASE_URL}/acts/${actor}/runs`,
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
  const apiToken = getApiToken();

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
  const apiToken = getApiToken();

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

export default { 
  triggerApifyScraper, 
  triggerGroupsScraper, 
  triggerPostsScraper, 
  triggerCommentsScraper,
  getApifyRunStatus, 
  getApifyResults, 
  AVAILABLE_ACTORS 
};
