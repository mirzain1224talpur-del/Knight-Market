# Fix: login OTP email flagged as phishing (route Supabase Auth → Resend)

**Problem:** the 6-digit login code email (`signInWithOTP`) is sent by Supabase's
*shared* SMTP sender, which is **not** authenticated for `knightmarket.org`.
Outlook/Microsoft sees an unauthenticated sender impersonating our brand and
flags it as **phishing**.

**Fix:** send Auth emails through **Resend** using our already-verified
`knightmarket.org` domain (the welcome email already sends from here, so
SPF/DKIM/DMARC all pass). Two parts — both in the Supabase Dashboard for project
`luidnjanoxtcdpadvkrz`.

---

## Part A — Custom SMTP (the real deliverability fix)

Dashboard → **Authentication → Emails → SMTP Settings** → toggle **Enable Custom SMTP**:

| Field         | Value                                             |
|---------------|---------------------------------------------------|
| Sender email  | `login@knightmarket.org`  (or `hello@knightmarket.org`) |
| Sender name   | `KnightMarket`                                    |
| Host          | `smtp.resend.com`                                 |
| Port          | `465`                                             |
| Username      | `resend`                                          |
| Password      | **the RESEND_API_KEY** (same value used by the send-welcome function — copy it from Dashboard → Edge Functions → Secrets → `RESEND_API_KEY`, or your `re_…` key in Resend) |

> Any address on `knightmarket.org` works because the whole domain is verified in
> Resend. Port 587 (STARTTLS) also works if 465 is blocked.

Then **Authentication → Rate Limits** → raise **"Rate limit for sending emails"**
(the default of ~2–4/hour is Supabase's built-in sender cap; with custom SMTP you
can safely raise it, e.g. 30–100/hour for launch).

## Part B — Brand the OTP email template

Dashboard → **Authentication → Emails → Templates → "Magic Link"** (this template
is what email-OTP login uses). Replace the body with
[`email-templates/magic-link.html`](email-templates/magic-link.html) and set the
**Subject** to: `Your KnightMarket login code`.

The template shows `{{ .Token }}` (the 6-digit code) prominently. Keep that
variable — it's what the app's `verifyOTP` expects.

---

## Verify it worked
1. In the iOS app, run the login flow with a real `@ucf.edu` (or a personal
   Outlook/Gmail) address.
2. Confirm the email arrives **from `login@knightmarket.org`**, lands in the
   inbox (not Junk/phishing), and shows the branded code.
3. Check headers: SPF=pass, DKIM=pass, DMARC=pass. In Gmail: "Show original".
4. Resend Dashboard → **Logs** should show the send with status *Delivered*.

## Notes
- No code change in the iOS app is required — this is pure Auth config.
- The **anon key** and login flow are unchanged.
- If a send fails, check Resend Logs first (auth/domain errors show there), then
  Supabase → Auth → Logs.
