// api/cleanup.js
// Deletes data for users who haven't signed in for 2+ years.
// Run monthly via Vercel Cron (see vercel.json).
//
// Vercel env vars needed:
//   SUPABASE_SERVICE_KEY  = service_role key (server only, no VITE_ prefix)
//   CRON_SECRET           = any random string you generate (e.g. openssl rand -hex 32)
//   VITE_SUPABASE_URL     = your Supabase project URL

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Protect endpoint — only Vercel Cron or you with the secret can call this
  const secret = req.headers["x-cron-secret"];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2-year inactivity cutoff
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  const cutoffISO = cutoff.toISOString();

  try {
    // Find stale users from auth.users via admin API
    const { data: { users }, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const staleUsers = (users || []).filter(
      u => u.last_sign_in_at && u.last_sign_in_at < cutoffISO
    );

    let deleted = 0;
    for (const u of staleUsers) {
      try {
        // Delete all data rows
        await Promise.all([
          sb.from("claims").delete().eq("user_id", u.id),
          sb.from("incomes").delete().eq("user_id", u.id),
          sb.from("receipts").delete().eq("user_id", u.id),
        ]);
        // Delete storage folder
        const { data: files } = await sb.storage.from("receipts").list(u.id);
        if (files?.length) {
          const paths = files.map(f => `${u.id}/${f.name}`);
          await sb.storage.from("receipts").remove(paths);
        }
        // Delete auth user
        await sb.auth.admin.deleteUser(u.id);
        deleted++;
      } catch (innerErr) {
        console.error(`Failed to delete user ${u.id}:`, innerErr);
      }
    }

    console.log(`Cleanup: deleted ${deleted} of ${staleUsers.length} stale users`);
    return res.status(200).json({ deleted, stale: staleUsers.length });
  } catch (e) {
    console.error("Cleanup error:", e);
    return res.status(500).json({ error: e.message });
  }
}
