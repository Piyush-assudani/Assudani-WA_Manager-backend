const db = require("../db");
const { sendTemplateMessage } = require("./metaApi");

let bullmqAvailable = false;
let Queue, Worker;


try {
  const bullmq = require("bullmq");
  Queue = bullmq.Queue;
  Worker = bullmq.Worker;
  bullmqAvailable = true;
} catch (err) {
  console.warn("⚠️  BullMQ not available, using in-memory queue fallback");
}





let campaignQueue = null;
let campaignWorker = null;

const initBullMQ = (io) => {
  if (!bullmqAvailable || process.env.USE_REDIS !== "true") {
    console.log("ℹ️ BullMQ/Redis disabled (set USE_REDIS=true to enable). Using in-memory queue fallback.");
    bullmqAvailable = false;
    return false;
  }

  try {
    const IORedis = require("ioredis");
    const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      retryStrategy: () => null, 
    });

    connection.on("error", (err) => {
      console.warn("⚠️ Redis connection error (will fallback to in-memory):", err.message);
      bullmqAvailable = false;
    });

    campaignQueue = new Queue("campaign-messages", { connection });

    campaignWorker = new Worker(
      "campaign-messages",
      async (job) => {
        const { to, templateName, languageCode, campaignId, contactId, mediaId, mediaType } = job.data;

        let components = [];
        if (mediaId && mediaType) {
          components.push({
            type: "header",
            parameters: [
              {
                type: mediaType,
                [mediaType]: { id: mediaId },
              },
            ],
          });
        }
        
        if (job.data.bodyParams && job.data.bodyParams.length > 0) {
          components.push({
            type: "body",
            parameters: job.data.bodyParams
          });
        }

        const result = await sendTemplateMessage(to, templateName, languageCode, components);

        await db.query(
          `INSERT INTO messages (campaign_id, contact_id, direction, message_body, meta_message_id, status, error_message, timestamp)
           VALUES ($1, $2, 'outbound', $3, $4, $5, $6, NOW())`,
          [
            campaignId,
            contactId,
            `[Template: ${templateName}]`,
            result.messageId || null,
            result.success ? "sent" : "failed",
            result.success ? null : (result.error || "Failed to send template message via Meta API"),
          ]
        );

        
        if (result.success) {
          await db.query(
            `UPDATE campaigns SET total_sent = total_sent + 1 WHERE id = $1`,
            [campaignId]
          );
        }

        
        if (io) {
          io.emit("campaign_progress", {
            campaignId,
            phone: to,
            success: result.success,
            error: result.error || null,
          });
        }

        return result;
      },
      {
        connection,
        limiter: {
          max: 1,
          duration: 2000, 
        },
      }
    );

    campaignWorker.on("failed", (job, err) => {
      console.error(`❌ Campaign job ${job.id} failed:`, err.message);
    });

    console.log("✅ BullMQ campaign worker initialized");
    return true;
  } catch (err) {
    console.warn("⚠️  Redis connection failed, falling back to in-memory queue:", err.message);
    bullmqAvailable = false;
    return false;
  }
};





const processInMemory = async (messages, campaignId, templateName, languageCode, io, mediaId = null, mediaType = null) => {
  const DELAY_MS = 2000; 

  let components = [];
  if (mediaId && mediaType) {
    components.push({
      type: "header",
      parameters: [
        {
          type: mediaType,
          [mediaType]: { id: mediaId },
        },
      ],
    });
  }

  for (let i = 0; i < messages.length; i++) {
    const { to, contactId, bodyParams } = messages[i];
    
    let messageComponents = [...components];
    if (bodyParams && bodyParams.length > 0) {
      messageComponents.push({
        type: "body",
        parameters: bodyParams
      });
    }

    try {
      const result = await sendTemplateMessage(to, templateName, languageCode, messageComponents);

      await db.query(
        `INSERT INTO messages (campaign_id, contact_id, direction, message_body, meta_message_id, status, error_message, timestamp)
         VALUES ($1, $2, 'outbound', $3, $4, $5, $6, NOW())`,
        [
          campaignId,
          contactId,
          `[Template: ${templateName}]`,
          result.messageId || null,
          result.success ? "sent" : "failed",
          result.success ? null : (result.error || "Failed to send template message via Meta API"),
        ]
      );

      if (result.success) {
        await db.query(
          `UPDATE campaigns SET total_sent = total_sent + 1 WHERE id = $1`,
          [campaignId]
        );
      }

      if (io) {
        io.emit("campaign_progress", {
          campaignId,
          phone: to,
          success: result.success,
          error: result.error || null,
        });
      }
    } catch (error) {
      console.error(`Error sending message to ${to}:`, error);
      await db.query(
        `INSERT INTO messages (campaign_id, contact_id, direction, message_body, meta_message_id, status, error_message, timestamp)
         VALUES ($1, $2, 'outbound', $3, NULL, 'failed', $4, NOW())`,
        [
          campaignId,
          contactId,
          `[Template: ${templateName}]`,
          error.message || "Unexpected error while sending template message",
        ]
      ).catch(() => {});
    }

    
    if (i < messages.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
};





const processCampaign = async (messages, campaignId, templateName, languageCode, io, mediaId = null, mediaType = null) => {
  if (bullmqAvailable && campaignQueue) {
    
    console.log(`📨 Enqueueing ${messages.length} messages via BullMQ`);
    for (const msg of messages) {
      await campaignQueue.add("send-template", {
        to: msg.to,
        contactId: msg.contactId,
        templateName,
        languageCode,
        campaignId,
        mediaId,
        mediaType,
        bodyParams: msg.bodyParams,
      });
    }
  } else {
    
    console.log(`📨 Processing ${messages.length} messages in-memory`);
    
    processInMemory(messages, campaignId, templateName, languageCode, io, mediaId, mediaType).catch((err) => {
      console.error("❌ In-memory campaign processing error:", err);
    });
  }
};

module.exports = { initBullMQ, processCampaign };
