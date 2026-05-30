-- KB-level synthesis: cross-podcast themes, agreements, disagreements
CREATE TABLE kb_syntheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  themes jsonb DEFAULT '[]'::jsonb,
  cross_references jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_kb_syntheses_kb ON kb_syntheses(knowledge_base_id);

ALTER TABLE kb_syntheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_syntheses" ON kb_syntheses FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_syntheses" ON kb_syntheses FOR INSERT TO anon WITH CHECK (true);
