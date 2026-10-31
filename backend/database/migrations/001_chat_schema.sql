-- Estrutura inicial do chat do Sistema de Estoque Hauy.
-- Os IDs de usuários vêm da aba 01_USUARIOS do Google Sheets.
-- Não há FK para usuários porque o cadastro continua no Google Sheets.

CREATE TABLE IF NOT EXISTS chat_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    adm_restricted_mode BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO chat_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_one_id VARCHAR(100) NOT NULL,
    participant_two_id VARCHAR(100) NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    conversation_type VARCHAR(20) NOT NULL DEFAULT 'DIRECT'
        CHECK (conversation_type IN ('DIRECT', 'ADM_REQUEST')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    CONSTRAINT chat_conversations_distinct_participants
        CHECK (participant_one_id <> participant_two_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_participant_one
    ON chat_conversations (participant_one_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_participant_two
    ON chat_conversations (participant_two_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_conversations_open_pair
    ON chat_conversations (
        LEAST(participant_one_id, participant_two_id),
        GREATEST(participant_one_id, participant_two_id)
    )
    WHERE status IN ('PENDING', 'ACTIVE');

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id UUID NOT NULL
        REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id VARCHAR(100) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    CONSTRAINT chat_messages_body_not_empty
        CHECK (length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages (conversation_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL UNIQUE
        REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id VARCHAR(100) NOT NULL,
    admin_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    CONSTRAINT chat_requests_distinct_participants
        CHECK (sender_id <> admin_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_requests_admin_status
    ON chat_requests (admin_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS chat_blocks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    blocker_id VARCHAR(100) NOT NULL,
    blocked_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_blocks_distinct_users CHECK (blocker_id <> blocked_id),
    CONSTRAINT chat_blocks_unique_pair UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_blocks_blocked
    ON chat_blocks (blocked_id, blocker_id);

CREATE TABLE IF NOT EXISTS chat_conversation_preferences (
    conversation_id UUID NOT NULL
        REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    notifications_muted BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
    ON chat_messages (conversation_id, read_at)
    WHERE read_at IS NULL;
