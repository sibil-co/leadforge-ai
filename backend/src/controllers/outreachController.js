import { query } from '../config/database.js';
import { generateOutreachMessage, analyzeConversation } from '../services/llmService.js';
import { sendMessengerMessage } from '../services/messengerService.js';
import { analyzeAndUpdateLeadStatus } from '../services/leadStatusService.js';

export const startOutreach = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const leadResult = await query(
      'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];

    if (lead.status === 'secured' || lead.status === 'dead') {
      return res.status(400).json({ error: 'Cannot start outreach for this lead status' });
    }

    const initialMessage = await generateOutreachMessage({
      name: lead.name,
      city: lead.city,
      price: lead.price,
      metadata: lead.metadata
    });

    await query(
      `UPDATE leads SET status = 'engaging', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    if (lead.facebook_id) {
      try {
        await sendMessengerMessage(lead.facebook_id, initialMessage);
      } catch (messengerError) {
        console.error('Failed to send initial message:', messengerError);
      }
    }

    const conversationEntry = {
      role: 'assistant',
      content: initialMessage,
      timestamp: new Date().toISOString()
    };

    const updatedHistory = [...(lead.conversation_history || []), conversationEntry];

    await query(
      'UPDATE leads SET conversation_history = $1 WHERE id = $2',
      [JSON.stringify(updatedHistory), id]
    );

    res.json({
      success: true,
      message: initialMessage,
      conversation: updatedHistory
    });
  } catch (error) {
    console.error('StartOutreach error:', error);
    res.status(500).json({ error: 'Failed to start outreach' });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const leadResult = await query(
      'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];
    const conversationHistory = lead.conversation_history || [];

    const userMessageEntry = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };

    const updatedHistory = [...conversationHistory, userMessageEntry];

    const aiResponse = await generateOutreachMessage({
      name: lead.name,
      city: lead.city,
      price: lead.price,
      metadata: lead.metadata,
      conversationHistory: updatedHistory
    });

    const aiMessageEntry = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    };

    updatedHistory.push(aiMessageEntry);

    if (lead.facebook_id) {
      try {
        await sendMessengerMessage(lead.facebook_id, aiResponse);
      } catch (messengerError) {
        console.error('Failed to send message via Messenger:', messengerError);
      }
    }

    await query(
      'UPDATE leads SET conversation_history = $1 WHERE id = $2',
      [JSON.stringify(updatedHistory), id]
    );

    await analyzeAndUpdateLeadStatus(id);

    res.json({
      success: true,
      userMessage: message,
      aiResponse: aiResponse,
      conversation: updatedHistory
    });
  } catch (error) {
    console.error('SendMessage error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

export const getConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await query(
      'SELECT conversation_history, status, name FROM leads WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({
      leadId: id,
      leadName: result.rows[0].name,
      status: result.rows[0].status,
      conversation: result.rows[0].conversation_history || []
    });
  } catch (error) {
    console.error('GetConversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
};

export const manualIntervention = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const { message, newStatus } = req.body;

    const leadResult = await query(
      'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];
    const conversationHistory = lead.conversation_history || [];

    if (message) {
      const manualMessageEntry = {
        role: 'manual',
        content: message,
        timestamp: new Date().toISOString()
      };

      const updatedHistory = [...conversationHistory, manualMessageEntry];

      if (lead.facebook_id) {
        try {
          await sendMessengerMessage(lead.facebook_id, message);
        } catch (messengerError) {
          console.error('Failed to send manual message:', messengerError);
        }
      }

      await query(
        'UPDATE leads SET conversation_history = $1 WHERE id = $2',
        [JSON.stringify(updatedHistory), id]
      );
    }

    if (newStatus && ['new', 'engaging', 'secured', 'dead'].includes(newStatus)) {
      await query(
        'UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2',
        [newStatus, id]
      );
    }

    res.json({ success: true, message: 'Intervention applied' });
  } catch (error) {
    console.error('ManualIntervention error:', error);
    res.status(500).json({ error: 'Failed to apply intervention' });
  }
};
