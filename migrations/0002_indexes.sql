CREATE INDEX IF NOT EXISTS idx_tours_slug ON tours(slug);
CREATE INDEX IF NOT EXISTS idx_tours_direction ON tours(direction);
CREATE INDEX IF NOT EXISTS idx_overrides_session ON demo_tour_overrides(session_id);
CREATE INDEX IF NOT EXISTS idx_user_tours_session ON demo_user_created_tours(session_id);
CREATE INDEX IF NOT EXISTS idx_availability_session_tour ON demo_availability(session_id, tour_id);
CREATE INDEX IF NOT EXISTS idx_orders_session_created ON orders(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_session_status ON orders(session_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_session_order ON payments(session_id, order_id);
CREATE INDEX IF NOT EXISTS idx_analytics_session_time ON analytics_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session_source ON analytics_events(session_id, source);
CREATE INDEX IF NOT EXISTS idx_analytics_session_tour ON analytics_events(session_id, tour_id);

CREATE INDEX IF NOT EXISTS idx_orders_session_display ON orders(session_id, display_id);
