import axios from 'axios';

const META_GRAPH_URL = 'https://graph.facebook.com/v18.0';

export const sendMessengerMessage = async (recipientId, message) => {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;

  if (!accessToken || !pageId) {
    throw new Error('Meta API credentials not configured');
  }

  try {
    const response = await axios.post(
      `${META_GRAPH_URL}/me/messages`,
      {
        messaging_type: 'RESPONSE',
        recipient: { id: recipientId },
        message: { text: message }
      },
      {
        params: { access_token: accessToken }
      }
    );

    return { success: true, messageId: response.data.message_id };
  } catch (error) {
    console.error('Messenger send error:', error.response?.data || error.message);
    throw new Error('Failed to send Messenger message');
  }
};

export const getConversationMessages = async (recipientId, limit = 20) => {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;

  if (!accessToken || !pageId) {
    throw new Error('Meta API credentials not configured');
  }

  try {
    const response = await axios.get(
      `${META_GRAPH_URL}/${pageId}/conversations`,
      {
        params: {
          access_token: accessToken,
          fields: 'messages{message,from,to,created_time}',
          limit
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Messenger fetch error:', error.response?.data || error.message);
    throw new Error('Failed to fetch Messenger messages');
  }
};

export default { sendMessengerMessage, getConversationMessages };
