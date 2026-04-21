// api/delete-account.js
// Deletes the Supabase Auth user record server-side using the service key.
// The client can delete their own data rows via RLS, but deleting the auth
// identity requires the service_role key which must never reach the browser.
//
// Vercel env var needed (NO VITE_ prefix — server only):
//   SUPABASE_SERVICE_KEY = <service_role key from Supabase → Project Settings → API>

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate body
  const { userId } = req.body || {};
  if (!userId || typeof userId !== "string" || userId.length < 10) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  // Require service key
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    console.error("Missing SUPABASE_SERVICE_KEY or VITE_SUPABASE_URL");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  try {
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the request is from an authenticated user matching the userId
    // by checking the Authorization header (Supabase session JWT)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing auth token" });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: "Invalid auth token" });
    }
    // Only allow users to delete their own account
    if (user.id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Delete the auth user (data rows already deleted client-side via RLS)
    const { error } = await sb.auth.admin.deleteUser(userId);
    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("Delete account error:", e);
    return res.status(500).json({ error: e.message || "Deletion failed" });
  }
}
