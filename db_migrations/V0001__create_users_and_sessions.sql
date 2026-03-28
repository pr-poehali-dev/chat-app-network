
CREATE TABLE IF NOT EXISTS t_p39338824_chat_app_network.users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  is_online BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS t_p39338824_chat_app_network.sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES t_p39338824_chat_app_network.users(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON t_p39338824_chat_app_network.sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON t_p39338824_chat_app_network.sessions(user_id);
