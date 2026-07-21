// This file runs on Cloudflare's servers, not in the visitor's browser.
// It receives a form submission, saves it to Supabase, then emails Maor via Resend.
// You never need to edit this file — all the secret keys it needs come from
// Cloudflare's "Environment Variables" settings, not from this code.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { type, photo_base64, photo_filename, ...data } = body;

    let table, subject, summaryHtml;

    if (type === "application") {
      table = "applications";
      subject = `New application: ${data.first_name || ""} ${data.last_name || ""}`.trim();
      summaryHtml = `<h2>New application</h2>${objectToHtml(data)}`;
    } else if (type === "advice") {
      table = "advice_submissions";
      subject = "New anonymous advice submission";
      summaryHtml = `<h2>New advice submission</h2>${objectToHtml(data)}`;
    } else if (type === "event") {
      table = "event_enquiries";
      subject = `New event enquiry: ${data.event_name || ""}`;
      summaryHtml = `<h2>New event enquiry</h2>${objectToHtml(data)}`;
    } else {
      return json({ error: "Unknown form type" }, 400);
    }

    // 1. Save to Supabase
    const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(data),
    });

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      return json({ error: "Could not save submission", details: errText }, 500);
    }

    // 2. Email Maor via Resend (photo, if any, comes through as an attachment)
    const emailPayload = {
      from: env.NOTIFY_FROM_EMAIL,
      to: env.NOTIFY_TO_EMAIL,
      subject,
      html: summaryHtml,
    };

    if (photo_base64 && photo_filename) {
      emailPayload.attachments = [{ filename: photo_filename, content: photo_base64 }];
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });
    const resendText = await resendRes.text();

    // TEMPORARY debug fields - remove resend_ok/resend_detail once email is confirmed working
    return json({ success: true, resend_ok: resendRes.ok, resend_status: resendRes.status, resend_detail: resendText.substring(0, 500) }, 200);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

function objectToHtml(obj) {
  return `<table>${Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("")}</table>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
