import { query } from '../config/database.js';
import { analyzeConversation } from './llmService.js';

export const analyzeAndUpdateLeadStatus = async (leadId) => {
  try {
    const leadResult = await query(
      'SELECT conversation_history FROM leads WHERE id = $1',
      [leadId]
    );

    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const conversationHistory = leadResult.rows[0].conversation_history || [];

    if (conversationHistory.length < 2) {
      return { updated: false, reason: 'Not enough conversation history' };
    }

    const { sentiment, confidence } = await analyzeConversation(conversationHistory);

    if (sentiment === 'positive' && confidence >= 0.7) {
      await query(
        "UPDATE leads SET status = 'secured', updated_at = NOW() WHERE id = $1",
        [leadId]
      );
      return { updated: true, newStatus: 'secured', reason: 'Positive sentiment detected' };
    }

    if (sentiment === 'negative' && confidence >= 0.6) {
      await query(
        "UPDATE leads SET status = 'dead', updated_at = NOW() WHERE id = $1",
        [leadId]
      );
      return { updated: true, newStatus: 'dead', reason: 'Negative sentiment detected' };
    }

    return { updated: false, sentiment, confidence };
  } catch (error) {
    console.error('AnalyzeLeadStatus error:', error);
    throw error;
  }
};

export const bulkUpdateLeadStatuses = async (userId) => {
  try {
    const leadsResult = await query(
      "SELECT id, conversation_history FROM leads WHERE user_id = $1 AND status = 'engaging'",
      [userId]
    );

    const results = [];

    for (const lead of leadsResult.rows) {
      const result = await analyzeAndUpdateLeadStatus(lead.id);
      results.push({ leadId: lead.id, ...result });
    }

    return results;
  } catch (error) {
    console.error('BulkUpdateLeadStatuses error:', error);
    throw error;
  }
};

export default { analyzeAndUpdateLeadStatus, bulkUpdateLeadStatuses };
