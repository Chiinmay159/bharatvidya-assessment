-- ================================================================
-- 030: Pin search_path on the last 8 mutable-search_path functions
-- ================================================================
-- Supabase linter (function_search_path_mutable) flags 8 functions
-- that never set an explicit search_path. Without it, a SECURITY
-- DEFINER function can be steered to resolve unqualified names against
-- an attacker-controlled schema. Every other function in the schema
-- already sets `search_path = public`; this closes the remainder.
--
-- ALTER FUNCTION is used (not CREATE OR REPLACE) so bodies are
-- untouched — this only pins name resolution. All 8 are zero-arg
-- trigger/helper functions. Safe, idempotent hardening.

ALTER FUNCTION public.protect_active_batch()            SET search_path = public;
ALTER FUNCTION public.bank_question_workflow()          SET search_path = public;
ALTER FUNCTION public.gen_exam_code()                   SET search_path = public;
ALTER FUNCTION public.batches_autocode()                SET search_path = public;
ALTER FUNCTION public.get_server_time()                 SET search_path = public;
ALTER FUNCTION public.restrict_attempt_update_columns() SET search_path = public;
ALTER FUNCTION public.gen_certificate_code()            SET search_path = public;
ALTER FUNCTION public.client_ip()                       SET search_path = public;
