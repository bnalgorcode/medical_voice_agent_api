
const axios = require("axios");
const { hosts, zohoRequest } = require("./zohoClient");
const { getDoctorByProviderId, updateDoctorFields } = require("./zohoStorage");

/**
 * Start OAuth: redirect user to Zoho Accounts.
 * State carries providerId so callback knows whom to save tokens for.
 */
async function startAuth(req, res) {
  try {
    const providerId = String(req.params.providerId);
    if (!providerId) {
      return res.status(400).send("Invalid providerId");
    }
    const doctor = await getDoctorByProviderId(providerId);
    if (!doctor) return res.status(404).send("Provider not found");

    const dc = (doctor.ZOHO_DC || process.env.ZOHO_DC || "com").trim();
    const accounts = hosts(dc).accounts;
    const clientId = doctor.ZOHO_CLIENT_ID || process.env.ZOHO_CLIENT_ID;
    const redirectUri = process.env.ZOHO_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return res.status(500).send("Missing client or redirect env");
    }

    const scope = encodeURIComponent("ZohoCRM.modules.ALL,ZohoCRM.settings.ALL");
    const url = `${accounts}/oauth/v2/auth?scope=${scope}&client_id=${encodeURIComponent(clientId)}&response_type=code&access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(String(providerId))}&prompt=consent`;
    return res.redirect(url);
  } catch (err) {
    console.error("startAuth error", err);
    return res.status(500).send("Auth init failed");
  }
}

/**
 * OAuth callback: exchange code for tokens and store refresh/access in Airtable.
 * Expects ?code=...&state=providerId
 */
async function handleCallback(req, res) {
  try {
    const code = req.query.code;
    const providerId = String(req.query.state);
    if (!code || !Number.isFinite(providerId)) {
      return res.status(400).send("Missing code/state");
    }
    const doctor = await getDoctorByProviderId(providerId);
    if (!doctor) return res.status(404).send("Provider not found");

    const dc = (doctor.ZOHO_DC || process.env.ZOHO_DC || "com").trim();
    const { accounts } = hosts(dc);
    const clientId = doctor.ZOHO_CLIENT_ID || process.env.ZOHO_CLIENT_ID;
    const clientSecret = doctor.ZOHO_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET;
    const redirectUri = process.env.ZOHO_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).send("Missing client/secret/redirect");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const tokenUrl = `${accounts}/oauth/v2/token`;
    const resp = await axios.post(tokenUrl, body, { timeout: 12000 });
    const { access_token, refresh_token, expires_in } = resp.data || {};
    if (!refresh_token) {
      console.error("No refresh_token in response", resp.data);
      return res.status(500).send("No refresh token from Zoho");
    }

    const expiresAt = Date.now() + (Number(expires_in || 3600) * 1000);

    await updateDoctorFields(providerId, {
      ZOHO_ACCESS_TOKEN: access_token,
      ZOHO_REFRESH_TOKEN: refresh_token,
      ZOHO_TOKEN_EXPIRES_AT: String(expiresAt),
      ZOHO_DC: dc,
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
    });

    return res.send("Zoho connected. You can close this window.");
  } catch (err) {
    console.error("handleCallback error", err?.response?.data || err);
    return res.status(500).send("Token exchange failed");
  }
}

/**
 * Upsert a Lead in Zoho CRM by email (preferred) or phone.
 * Body: { user_name, user_email, user_phone, message, intent, channel, context }
 */
async function upsertLead(req, res) {
  try {
    const providerId = String(req.params.providerId);
    const { user_name, user_email, user_phone, message, intent, channel, context } = req.body || {};
    if (!providerId) {
      return res.status(400).json({ error: "Invalid providerId" });
    }
    if (!user_email && !user_phone) {
      return res.status(400).json({ error: "Require user_email or user_phone" });
    }

    // 1) Search for existing lead
    let criteria;
    if (user_email) criteria = `(Email:equals:${user_email})`;
    else criteria = `(Phone:equals:${user_phone})`;

    const search = await zohoRequest(providerId, "GET", `/crm/v3/Leads/search?criteria=${encodeURIComponent(criteria)}`);
    const found = (search.data && Array.isArray(search.data.data) && search.data.data[0]) ? search.data.data[0] : null;

    // 2) Build payload
    const payload = {
      data: [{
        Company: "Inbound - Voiceflow",
        Last_Name: user_name || "Unknown",
        Email: user_email || undefined,
        Phone: user_phone || undefined,
        Description: message || undefined,
        Lead_Source: channel || "Chatbot",
        VF_Intent: intent || undefined,
      }],
      trigger: ["workflow"],
    };

    // 3) Create or update
    let resp;
    if (found && found.id) {
      resp = await zohoRequest(providerId, "PUT", `/crm/v3/Leads/${found.id}`, payload);
    } else {
      resp = await zohoRequest(providerId, "POST", `/crm/v3/Leads`, payload);
    }

    const leadId = resp.data?.data?.[0]?.details?.id;
    // 4) Add a Note
    if (leadId) {
      await zohoRequest(providerId, "POST", `/crm/v3/Leads/${leadId}/Notes`, {
        data: [{
          Note_Title: "Chat transcript",
          Note_Content: JSON.stringify({ intent, message, context }, null, 2),
        }],
      });
    }

    return res.json({ ok: true, zoho: resp.data });
  } catch (err) {
    console.error("upsertLead error", err?.response?.data || err);
    return res.status(500).json({ error: "Zoho lead upsert failed" });
  }
}


/**
 * Convert a Lead into Contact (and optional Deal).
 * POST /api/zoho/:providerId/leads/:leadId/convert
 * Body: { deal_name?, stage?, amount?, assign_to?, notify_lead_owner? }
 */
async function convertLead(req, res) {
  try {
    const providerId = String(req.params.providerId);
    const leadId = String(req.params.leadId);
    const {
      deal_name,
      stage = "Intake",
      amount,
      assign_to = null,
      notify_lead_owner = true
    } = req.body || {};

    if (!providerId || !leadId) {
      return res.status(400).json({ error: "Invalid providerId or leadId" });
    }

    const payload = {
      data: [{
        overwrite: true,
        notify_lead_owner,
        assign_to, // set to Zoho user ID if you want a specific owner
        Deals: deal_name ? {
          Deal_Name: deal_name,
          Stage: stage,
          Amount: typeof amount === "number" ? amount : undefined
        } : undefined
      }]
    };

    const resp = await zohoRequest(providerId, "POST", `/crm/v3/Leads/${leadId}/actions/convert`, payload);
    return res.json({ ok: true, result: resp.data });
  } catch (err) {
    console.error("convertLead error", err?.response?.data || err);
    return res.status(500).json({ error: "Zoho lead convert failed" });
  }
}


module.exports = { startAuth, handleCallback, upsertLead, convertLead };
