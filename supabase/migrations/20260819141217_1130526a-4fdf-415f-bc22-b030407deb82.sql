CREATE TABLE public.email_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_sender text NOT NULL DEFAULT 'nexus' CHECK (default_sender IN ('nexus','gmail')),
  from_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own email settings"
ON public.email_settings FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER email_settings_set_updated_at
BEFORE UPDATE ON public.email_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sender_mode text NOT NULL CHECK (sender_mode IN ('nexus','gmail')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','suppressed')),
  error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sent mail"
ON public.email_messages FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX email_messages_user_created_idx ON public.email_messages (user_id, created_at DESC);

CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  account_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;