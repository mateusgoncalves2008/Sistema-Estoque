ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT
        REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply
    ON chat_messages (reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_message_reactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_message_reactions_unique_user UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
    ON chat_message_reactions (message_id, emoji);
