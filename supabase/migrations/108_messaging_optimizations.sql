-- Résolution E-06 : RPC pour récupérer les conversations avec le compteur de non-lus
-- Élimine le pattern N+1 (1 requête par conversation pour compter les non-lus)

CREATE OR REPLACE FUNCTION get_conversations_with_unread(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    participant_1 UUID,
    participant_2 UUID,
    last_message_text TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, c.created_at, c.updated_at, c.participant_1, c.participant_2,
        c.last_message_text, c.last_message_at,
        COALESCE(COUNT(dm.id) FILTER (WHERE dm.is_read = false AND dm.sender_id != p_user_id), 0) AS unread_count
    FROM conversations c
    LEFT JOIN direct_messages dm ON dm.conversation_id = c.id
    WHERE c.participant_1 = p_user_id OR c.participant_2 = p_user_id
    GROUP BY c.id
    ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
