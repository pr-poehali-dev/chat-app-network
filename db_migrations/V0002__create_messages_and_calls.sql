
CREATE TABLE IF NOT EXISTS t_p39338824_chat_app_network.messages (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER REFERENCES t_p39338824_chat_app_network.users(id),
  to_user_id INTEGER REFERENCES t_p39338824_chat_app_network.users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_messages_from ON t_p39338824_chat_app_network.messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_to ON t_p39338824_chat_app_network.messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON t_p39338824_chat_app_network.messages(created_at);

CREATE TABLE IF NOT EXISTS t_p39338824_chat_app_network.calls (
  id SERIAL PRIMARY KEY,
  caller_id INTEGER REFERENCES t_p39338824_chat_app_network.users(id),
  callee_id INTEGER REFERENCES t_p39338824_chat_app_network.users(id),
  status VARCHAR(20) DEFAULT 'ringing',
  started_at TIMESTAMP DEFAULT NOW(),
  answered_at TIMESTAMP,
  ended_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calls_caller ON t_p39338824_chat_app_network.calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON t_p39338824_chat_app_network.calls(callee_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON t_p39338824_chat_app_network.calls(status);
