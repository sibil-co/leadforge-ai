import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-nano';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are a friendly, professional sales assistant for a real estate or product sourcing business. 
Your goal is to engage leads in natural, conversational dialogue to understand their needs and convert them into customers.

Guidelines:
- Be warm, friendly, and helpful
- Ask relevant questions to understand their requirements
- Never be pushy or aggressive
- If they show interest (asking about prices, features, wanting to learn more), mark this as positive sentiment
- If they say they're not interested, busy, or want to be left alone, respect their wishes
- Keep messages concise and conversational
- Use the lead's name and reference any details they've shared`;

const OUTREACH_TEMPLATE = (lead) => `Hi ${lead.name}! 👋

${lead.city ? `I noticed you're in ${lead.city} area` : 'I came across your profile'}${lead.price ? ` and saw you might be interested in something around $${lead.price}` : ''}.

I wanted to reach out because I think we might have something that could help you. Would you be open to a quick chat?`;

export const generateOutreachMessage = async ({ name, city, price, metadata, conversationHistory }) => {
  const useAnthropic = !!ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY;

  if (!conversationHistory || conversationHistory.length === 0) {
    const initialMessage = OUTREACH_TEMPLATE({ name, city, price });

    if (useAnthropic) {
      return await generateWithAnthropic(initialMessage, []);
    }
    return await generateWithOpenAI(initialMessage, []);
  }

  const recentHistory = conversationHistory.slice(-6);
  const context = recentHistory
    .map(msg => `${msg.role === 'user' ? 'Lead' : 'You'}: ${msg.content}`)
    .join('\n');

  const prompt = `Continue the conversation naturally. Respond to the lead's last message.

Conversation so far:
${context}

Generate a natural, conversational response:`;

  if (useAnthropic) {
    return await generateWithAnthropic(prompt, recentHistory);
  }
  return await generateWithOpenAI(prompt, recentHistory);
};

const generateWithOpenAI = async (prompt, history) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  if (history.length > 0) {
    messages.push(...history.map(msg => ({
      role: msg.role === 'manual' ? 'assistant' : msg.role,
      content: msg.content
    })));
  }

  messages.push({ role: 'user', content: prompt });

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages,
      max_tokens: 200,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI error:', error.message);
    throw new Error('Failed to generate message');
  }
};

const generateWithAnthropic = async (prompt, history) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [
          ...history.map(msg => ({
            role: msg.role === 'manual' ? 'assistant' : msg.role,
            content: msg.content
          })),
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Anthropic error:', error.message);
    throw new Error('Failed to generate message');
  }
};

export const analyzeConversation = async (conversationHistory) => {
  const positiveKeywords = ['interested', 'yes', 'sure', 'definitely', 'great', 'love', 'want', 'more info', 'tell me', 'how much', 'price', 'deal', 'buy'];
  const negativeKeywords = ['no', 'not interested', 'busy', 'later', 'don't', 'stop', 'leave me', 'remove', 'unsubscribe'];

  const allText = conversationHistory
    .map(msg => msg.content.toLowerCase())
    .join(' ');

  let positiveCount = 0;
  let negativeCount = 0;

  positiveKeywords.forEach(keyword => {
    if (allText.includes(keyword)) positiveCount++;
  });

  negativeKeywords.forEach(keyword => {
    if (allText.includes(keyword)) negativeCount++;
  });

  if (positiveCount >= 2 && positiveCount > negativeCount) {
    return { sentiment: 'positive', confidence: 0.8 };
  } else if (negativeCount >= 1 && negativeCount > positiveCount) {
    return { sentiment: 'negative', confidence: 0.7 };
  }

  return { sentiment: 'neutral', confidence: 0.5 };
};

export default { generateOutreachMessage, analyzeConversation };
