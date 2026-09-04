const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { data } = await supabaseAdmin.from("cleaner_jobs").select("error").eq("id","eeaecffb-6618-442c-91bd-a4e127942976").maybeSingle();
console.log((data as any)?.error);
