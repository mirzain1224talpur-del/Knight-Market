// Supabase Edge Function: send-welcome
// Triggered by a Database Webhook on INSERT into the `waitlist` table.
// Sends a branded welcome email via Resend, then stamps `welcomed_at` on the row
// so the same person is never emailed twice (by this or the backfill function).
//
// Required secret (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY
// Auto-provided by Supabase (no setup needed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Before deploying, replace `yourdomain.com` in FROM_EMAIL with an address on
// the domain you verified in Resend.

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

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload?.record;
    const email = record?.email;
    const id = record?.id;

    if (!email) {
      return new Response(JSON.stringify({ error: "No email in webhook payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "Welcome to KnightMarket ⚔️",
        html: welcomeHtml(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: errText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mark as welcomed so the backfill never emails this person again.
    if (id) {
      await supabase
        .from("waitlist")
        .update({ welcomed_at: new Date().toISOString() })
        .eq("id", id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
