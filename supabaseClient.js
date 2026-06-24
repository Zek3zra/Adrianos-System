// supabaseClient.js
// Update this first line to use the CDN:
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://jhvglscasrufvfgenoej.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impodmdsc2Nhc3J1ZnZmZ2Vub2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMTQ4MTksImV4cCI6MjA5Nzg5MDgxOX0.lsNc5FYoKNZ5hqxC3fZ7EPdnO29eNkwDfXn5g4MAKtA';

export const supabase = createClient(supabaseUrl, supabaseKey);