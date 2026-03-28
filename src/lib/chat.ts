const CHAT_URL = "https://functions.poehali.dev/1e90d6d1-9d28-4436-8c84-9a9d5c03a05e";

export interface ChatUser {
  id: number;
  username: string;
  display_name: string;
  is_online: boolean;
  last_seen: string;
}

export interface ChatMessage {
  id: number;
  from_user_id: number;
  to_user_id: number;
  text: string;
  created_at: string;
  is_read: boolean;
}

export interface IncomingCall {
  id: number;
  caller_id: number;
  caller_name: string;
  status: string;
}

export interface OutgoingCall {
  id: number;
  callee_id: number;
  callee_name: string;
  status: string;
}

export interface PollResult {
  new_messages: Array<{ id: number; from_user_id: number; text: string; created_at: string; from_display_name: string }>;
  incoming_call: IncomingCall | null;
  outgoing_call: OutgoingCall | null;
}

async function call(body: object): Promise<Record<string, unknown>> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export const chatApi = {
  users: (token: string) =>
    call({ action: "users", token }) as Promise<{ users: ChatUser[] }>,

  send: (token: string, to_user_id: number, text: string) =>
    call({ action: "send", token, to_user_id, text }),

  messages: (token: string, with_user_id: number, since_id = 0) =>
    call({ action: "messages", token, with_user_id, since_id }) as Promise<{ messages: ChatMessage[] }>,

  poll: (token: string, since_msg_id: number) =>
    call({ action: "poll", token, since_msg_id }) as Promise<PollResult>,

  callStart: (token: string, to_user_id: number) =>
    call({ action: "call_start", token, to_user_id }) as Promise<{ call_id: number }>,

  callAnswer: (token: string, call_id: number) =>
    call({ action: "call_answer", token, call_id }),

  callEnd: (token: string, call_id?: number) =>
    call({ action: "call_end", token, ...(call_id ? { call_id } : {}) }),
};
