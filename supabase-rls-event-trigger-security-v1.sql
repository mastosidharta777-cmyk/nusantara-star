-- SECURITY: this function is invoked only by the ensure_rls event trigger.
-- Do not expose it as an RPC endpoint through the public schema.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- Keep the event trigger in place. It runs as its owner when public tables are
-- created and continues to enable RLS automatically.
