// Normalize a Cloud API inbound message into a flat shape the flow understands.
// Handles plain text, interactive button replies, and interactive list replies.
export function parseInbound(value, message) {
  const from = message.from;
  const messageId = message.id;
  const name = value?.contacts?.[0]?.profile?.name;

  if (message.type === "text") {
    return { from, messageId, name, type: "text", text: message.text?.body || "", value: null };
  }

  if (message.type === "interactive") {
    const i = message.interactive;
    if (i?.type === "button_reply") {
      return { from, messageId, name, type: "button", value: i.button_reply.id, text: i.button_reply.title };
    }
    if (i?.type === "list_reply") {
      return { from, messageId, name, type: "list", value: i.list_reply.id, text: i.list_reply.title };
    }
  }

  // Buttons from message templates arrive as type 'button'.
  if (message.type === "button") {
    return { from, messageId, name, type: "button", value: message.button?.payload, text: message.button?.text };
  }

  return { from, messageId, name, type: "other", value: null, text: "" };
}
