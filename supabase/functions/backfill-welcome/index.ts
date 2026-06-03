// Supabase Edge Function: backfill-welcome
// ON-DEMAND backfill. Emails everyone in `waitlist` who has NOT been welcomed yet
// (welcomed_at IS NULL), then stamps them so they're never emailed again.
//
// SAFE TO RUN ANYTIME: it only ever emails people who haven't gotten the welcome.
// Run it once for your existing signups; running it again does nothing unless new
// un-welcomed rows exist.
//
// Invoke it from the Supabase dashboard: Edge Functions -> backfill-welcome -> Invoke
// (no body needed), or via curl with your service_role key.
//
// Required secret (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Before deploying, replace `yourdomain.com` in FROM_EMAIL (keep it identical to
// the address in send-welcome).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "KnightMarket <hello@knightmarket.org>";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const welcomeHtml = (): string => `
<div style="background:#0A0A0A;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#F5F0E8;">
  <div style="max-width:480px;margin:0 auto;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;text-align:center;">
    <div style="font-size:24px;font-weight:800;letter-spacing:-0.5px;margin-bottom:8px;">Knight<span style="color:#FFC904;">Market</span></div>
    <div style="display:inline-block;font-size:11px;color:#FFC904;border:1px solid rgba(255,201,4,0.3);background:rgba(255,201,4,0.1);padding:4px 12px;border-radius:20px;margin-bottom:24px;">&#9876;&#65039; You're on the list</div>
    <h1 style="font-size:26px;margin:0 0 16px;color:#F5F0E8;">Welcome, founding Knight!</h1>
    <p style="font-size:15px;line-height:1.6;color:rgba(245,240,232,0.6);margin:0 0 20px;">
      Thanks for joining the KnightMarket waitlist. You're officially in line for early access to UCF's marketplace &mdash; built for Knights, by Knights.
    </p>
    <p style="font-size:15px;line-height:1.6;color:rgba(245,240,232,0.6);margin:0 0 24px;">
      We'll email you the moment we launch. Early members are <strong style="color:#FFC904;">free forever</strong>.
    </p>
    <p style="font-size:13px;color:rgba(245,240,232,0.35);margin-top:32px;">
      Go Knights &#9876;&#65039;<br/>&mdash; The KnightMarket Team
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:rgba(245,240,232,0.25);margin-top:24px;">
    You received this because you signed up at KnightMarket. Not affiliated with the University of Central Florida.
  </p>
</div>`;

Deno.serve(async () => {
  // Everyone who hasn't been welcomed yet.
  const { data, error } = await supabase
    .from("waitlist")
    .select("id, email")
    .is("welcomed_at", null);

  if (error) {
    console.error("DB read error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!data || data.length === 0) {
    return new Response(
      JSON.stringify({ message: "Nobody to email — everyone is already welcomed." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  let sent = 0;
  const failed: string[] = [];

  // Resend's batch endpoint sends up to 100 emails per call.
  for (let i = 0; i < data.length; i += 100) {
    const chunk = data.slice(i, i + 100);
    const batch = chunk.map((row) => ({
      from: FROM_EMAIL,
      to: [row.email],
      subject: "Welcome to KnightMarket ⚔️",
      html: welcomeHtml(),
    }));

    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });

    if (res.ok) {
      sent += chunk.length;
      // Stamp this chunk as welcomed so they won't be emailed again.
      const ids = chunk.map((r) => r.id);
      await supabase
        .from("waitlist")
        .update({ welcomed_at: new Date().toISOString() })
        .in("id", ids);
    } else {
      const errText = await res.text();
      console.error("Resend batch error:", errText);
      chunk.forEach((r) => failed.push(r.email));
    }
  }

  return new Response(
    JSON.stringify({ found: data.length, sent, failed }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
