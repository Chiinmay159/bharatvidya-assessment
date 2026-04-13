-- ================================================================
-- Migration 010: Drop stale UNIQUE(batch_id, roll_number) constraint
-- ================================================================
-- Migration 008 tried to drop "attempts_batch_roll_unique" but the actual
-- Supabase auto-generated name was "attempts_batch_id_roll_number_key".
-- This old constraint blocked retry attempts (second attempt for same
-- student in same batch violated the two-column unique).
-- ================================================================

ALTER TABLE public.attempts DROP CONSTRAINT IF EXISTS attempts_batch_id_roll_number_key;
