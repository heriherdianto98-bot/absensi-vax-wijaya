const SUPABASE_URL = "https://cmtuufwzjshixivykbjf.supabase.co";

const SUPABASE_KEY = "sb_publishable_G1YbpcwxO_pr-uYeJCgLfw_0hWMr2Ex";

const db = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

console.log("✅ Supabase Connected");