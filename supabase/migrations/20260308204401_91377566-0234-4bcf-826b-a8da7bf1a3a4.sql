
-- ===========================================
-- Relai CRM — Full Production Schema
-- ===========================================

-- 1. ROLES ENUM & USER ROLES TABLE
CREATE TYPE public.app_role AS ENUM ('admin', 'sales_manager', 'sales_rep', 'viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'sales_rep',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 2. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  team TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'sales_rep');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. CLIENTS TABLE
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'Other' CHECK (client_type IN ('Hedge Fund', 'Bank', 'Asset Manager', 'Corporate', 'Vendor', 'Other')),
  headquarters_country TEXT DEFAULT '',
  aum TEXT DEFAULT '',
  strategy_focus TEXT DEFAULT '',
  client_tier TEXT NOT NULL DEFAULT 'Tier 2' CHECK (client_tier IN ('Tier 1', 'Tier 2', 'Tier 3')),
  relationship_status TEXT NOT NULL DEFAULT 'Prospect' CHECK (relationship_status IN ('Prospect', 'Active Client', 'Dormant', 'Strategic')),
  owner_id UUID REFERENCES auth.users(id),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update clients" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete clients" ON public.clients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. CONTACTS TABLE
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  email TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  influence_level TEXT DEFAULT 'Unknown' CHECK (influence_level IN ('Decision Maker', 'Influencer', 'Research Contact', 'Procurement', 'Unknown')),
  relationship_strength TEXT DEFAULT 'Weak' CHECK (relationship_strength IN ('Weak', 'Medium', 'Strong')),
  last_interaction_date DATE,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. DATASETS TABLE
CREATE TABLE public.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  coverage TEXT DEFAULT '',
  update_frequency TEXT DEFAULT '',
  example_use_cases TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view datasets" ON public.datasets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert datasets" ON public.datasets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update datasets" ON public.datasets FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON public.datasets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. OPPORTUNITIES TABLE
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id),
  stage TEXT NOT NULL DEFAULT 'Lead' CHECK (stage IN ('Lead', 'Initial Discussion', 'Demo Scheduled', 'Trial', 'Evaluation', 'Commercial Discussion', 'Contract Sent', 'Closed Won', 'Closed Lost')),
  value NUMERIC NOT NULL DEFAULT 0,
  expected_close DATE,
  probability INTEGER NOT NULL DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  owner_id UUID REFERENCES auth.users(id),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view opportunities" ON public.opportunities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert opportunities" ON public.opportunities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update opportunities" ON public.opportunities FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete opportunities" ON public.opportunities FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. OPPORTUNITY STAGE HISTORY
CREATE TABLE public.opportunity_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.opportunity_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view stage history" ON public.opportunity_stage_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert stage history" ON public.opportunity_stage_history FOR INSERT TO authenticated WITH CHECK (true);

-- Auto-track stage changes
CREATE OR REPLACE FUNCTION public.track_opportunity_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.opportunity_stage_history (opportunity_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_opportunity_stage_change
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.track_opportunity_stage_change();

-- 9. MEETINGS TABLE
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  meeting_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  participants TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  key_questions TEXT DEFAULT '',
  next_steps TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view meetings" ON public.meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert meetings" ON public.meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update meetings" ON public.meetings FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. EMAILS TABLE
CREATE TABLE public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT '',
  summary TEXT DEFAULT '',
  key_takeaways TEXT DEFAULT '',
  email_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view emails" ON public.emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert emails" ON public.emails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update emails" ON public.emails FOR UPDATE TO authenticated USING (true);

-- 11. RESEARCH SIGNALS TABLE
CREATE TABLE public.research_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  strength TEXT NOT NULL DEFAULT 'Medium' CHECK (strength IN ('Low', 'Medium', 'High')),
  source_type TEXT NOT NULL DEFAULT 'Email' CHECK (source_type IN ('Meeting', 'Email', 'Demo', 'Conference', 'Call')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.research_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view signals" ON public.research_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert signals" ON public.research_signals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update signals" ON public.research_signals FOR UPDATE TO authenticated USING (true);

-- 12. DELIVERIES TABLE
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  delivery_type TEXT NOT NULL DEFAULT 'Full dataset' CHECK (delivery_type IN ('Full dataset', 'Trial', 'Sample data', 'API access')),
  delivery_method TEXT NOT NULL DEFAULT 'SFTP' CHECK (delivery_method IN ('SFTP', 'API', 'Download')),
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view deliveries" ON public.deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert deliveries" ON public.deliveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update deliveries" ON public.deliveries FOR UPDATE TO authenticated USING (true);

-- 13. CONTRACTS TABLE
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  contract_value NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  contract_type TEXT NOT NULL DEFAULT 'Annual' CHECK (contract_type IN ('Annual', 'Trial', 'Custom')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Active', 'Expired', 'Pending')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update contracts" ON public.contracts FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 14. RENEWALS TABLE
CREATE TABLE public.renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  renewal_date DATE NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  status TEXT NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Negotiation', 'Renewed', 'Lost')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view renewals" ON public.renewals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert renewals" ON public.renewals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update renewals" ON public.renewals FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_renewals_updated_at BEFORE UPDATE ON public.renewals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 15. NOTES TABLE
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view notes" ON public.notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert notes" ON public.notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authors can update notes" ON public.notes FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 16. ACTIVITIES TABLE
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('note', 'call', 'email', 'meeting', 'stage_change', 'delivery', 'contract', 'renewal', 'other')),
  description TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view activities" ON public.activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert activities" ON public.activities FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- INDEXES
CREATE INDEX idx_contacts_client ON public.contacts(client_id);
CREATE INDEX idx_opportunities_client ON public.opportunities(client_id);
CREATE INDEX idx_opportunities_dataset ON public.opportunities(dataset_id);
CREATE INDEX idx_opportunities_owner ON public.opportunities(owner_id);
CREATE INDEX idx_opportunities_stage ON public.opportunities(stage);
CREATE INDEX idx_deliveries_client ON public.deliveries(client_id);
CREATE INDEX idx_contracts_client ON public.contracts(client_id);
CREATE INDEX idx_renewals_client ON public.renewals(client_id);
CREATE INDEX idx_renewals_date ON public.renewals(renewal_date);
CREATE INDEX idx_research_signals_client ON public.research_signals(client_id);
CREATE INDEX idx_activities_client ON public.activities(client_id);
CREATE INDEX idx_activities_opportunity ON public.activities(opportunity_id);
CREATE INDEX idx_notes_client ON public.notes(client_id);
CREATE INDEX idx_notes_opportunity ON public.notes(opportunity_id);
