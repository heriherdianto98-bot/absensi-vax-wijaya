import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) process.exit(0);

const supabase = createClient(url, key);
const { data, error } = await supabase
  .from("sync_status")
  .select("id,last_sync_at")
  .eq("id", 1)
  .maybeSingle();

if (error || !data?.last_sync_at) process.exit(0);

const next = new Date(new Date(data.last_sync_at).getTime() + 60 * 1000);
await supabase
  .from("sync_status")
  .update({ next_sync_at: next.toISOString() })
  .eq("id", 1);
