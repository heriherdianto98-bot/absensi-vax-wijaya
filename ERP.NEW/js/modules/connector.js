/*
=========================================
VAX ERP
Supabase Connector
=========================================
*/

const SUPABASE_URL =
"https://cmtuufwzjshixivykbjf.supabase.co";

const SUPABASE_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdHV1Znd6anNoaXhpdnlrYmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzk4MDksImV4cCI6MjEwMDc1NTgwOX0.QzfAecp9A6qxJdpE_1WH93T6--hXiqudMVUyfedLh2Q"

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);