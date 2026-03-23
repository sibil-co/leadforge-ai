import { query } from '../config/database.js';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-nano';

// Helper function to evaluate a lead via GPT
async function evaluateLead(lead, userKeywords) {
  const systemPrompt = `You are an AI assistant helping a real estate/sourcing professional filter potential leads from social media posts.
Your task is to review the given social media post text and determine if it matches what the user is looking for.
The user's target keywords/criteria are: ${userKeywords && userKeywords.length > 0 ? userKeywords.join(', ') : 'any relevant rental or property listings'}.

If the post is relevant and looks like a valid lead for these criteria, respond with the exact word: "RELEVANT".
If the post is spam, completely irrelevant, or not a post advertising what the user wants, respond with the exact word: "IRRELEVANT".
Do not include any other text in your response.`;

  const leadText = lead.metadata?.text || lead.metadata?.message || "";

  if (!leadText) {
    return 'IRRELEVANT'; // No text to evaluate
  }

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Post Text: "${leadText}"\n\nIs this RELEVANT or IRRELEVANT?` }
      ],
      response_format: { type: 'text' },
      reasoning_effort: 'low',
      store: true,
    });

    const answer = response.choices[0].message.content.trim().toUpperCase();
    return answer.includes('RELEVANT') && !answer.includes('IRRELEVANT') ? 'RELEVANT' : 'IRRELEVANT';
  } catch (error) {
    console.error('Error evaluating lead with OpenAI:', error.message);
    return 'ERROR';
  }
}

export const filterUnfilteredLeads = async (req, res) => {
  try {
    const userId = req.userId;

    // Fetch up to 50 unfiltered leads for this user
    const result = await query(
      "SELECT * FROM leads WHERE user_id = $1 AND status = 'unfiltered' LIMIT 50",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'No unfiltered leads to process', processed: 0, newLeads: 0, deadLeads: 0 });
    }

    const leads = result.rows;
    let newLeadsCount = 0;
    let deadLeadsCount = 0;
    let errorCount = 0;

    // Optionally fetch user's last search keywords if we wanted to be perfectly dynamic,
    // but for now we look for keywords in the lead's metadata. 
    // They are populated in scrapeOrchestrator under keywords_matched, or we can just ask GPT generally.

    for (const lead of leads) {
      const keywords = lead.metadata?.keywords_matched || [];
      const evaluation = await evaluateLead(lead, keywords);

      if (evaluation === 'RELEVANT') {
        await query("UPDATE leads SET status = 'new' WHERE id = $1", [lead.id]);
        newLeadsCount++;
      } else if (evaluation === 'IRRELEVANT') {
        await query("UPDATE leads SET status = 'dead' WHERE id = $1", [lead.id]);
        deadLeadsCount++;
      } else {
        errorCount++;
      }
    }

    res.json({
      message: `Processed ${leads.length} leads.`,
      processed: leads.length,
      newLeads: newLeadsCount,
      deadLeads: deadLeadsCount,
      errors: errorCount
    });

  } catch (error) {
    console.error('FilterUnfilteredLeads error:', error);
    res.status(500).json({ error: 'Failed to filter leads' });
  }
};
