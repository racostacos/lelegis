UPDATE bills SET detail_synced_at = NULL WHERE detail_synced_at IS NOT NULL;
