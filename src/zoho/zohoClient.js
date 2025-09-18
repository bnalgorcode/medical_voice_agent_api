
const axios = require("axios");
const { getDoctorByProviderId, updateDoctorFields } = require("./zohoStorage");

/**
 * Build the correct accounts and API base hosts by DC.
 */
function hosts(dc) {
  const dcPart = dc && typeof dc === "string" ? dc.trim() : "com";
  return {
    accounts: `https://accounts.zoho.${dcPart}`,
    api: `https://www.zohoapis.${dcPart}`,
  };
}

/**
 * Get a fresh access token for this provider.
 * Prefers existing access_token if not expired; otherwise refreshes using refresh_token.
 * Stores new token + expiry back to Airtable.
 */
async function getAccessToken(providerId) {
  const doctor = await getDoctorByProviderId(providerId);
  if (!doctor) throw new Error("Provider not found");
  const {
    ZOHO_DC = "com",
    ZOHO_ACCESS_TOKEN,
    ZOHO_REFRESH_TOKEN,
    ZOHO_TOKEN_EXPIRES_AT,
    ZOHO_CLIENT_ID,
    ZOHO_CLIENT_SECRET,
  } = doctor;

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    throw new Error("Missing Zoho client credentials for provider");
  }

  const now = Date.now();
  if (ZOHO_ACCESS_TOKEN && ZOHO_TOKEN_EXPIRES_AT && now < Number(ZOHO_TOKEN_EXPIRES_AT) - 60_000) {
    return { accessToken: ZOHO_ACCESS_TOKEN, dc: ZOHO_DC || "com" };
  }

  if (!ZOHO_REFRESH_TOKEN) throw new Error("Provider not connected to Zoho (no refresh token)");

  const { accounts } = hosts(ZOHO_DC);
  const tokenUrl = `${accounts}/oauth/v2/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
  });

  const resp = await axios.post(tokenUrl, body, { timeout: 10000 });
  const { access_token, expires_in } = resp.data;
  const expiresAt = Date.now() + (Number(expires_in || 3600) * 1000);

  await updateDoctorFields(providerId, {
    ZOHO_ACCESS_TOKEN: access_token,
    ZOHO_TOKEN_EXPIRES_AT: String(expiresAt),
  });

  return { accessToken: access_token, dc: ZOHO_DC || "com" };
}

/**
 * Call Zoho CRM REST with auto token management.
 */
async function zohoRequest(providerId, method, path, data) {
  const { accessToken, dc } = await getAccessToken(providerId);
  const { api } = hosts(dc);
  const url = `${api}${path}`;
  const resp = await axios({
    method,
    url,
    data,
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    timeout: 12000,
    validateStatus: s => s >= 200 && s < 500,
  });

  // If unauthorized, try exactly one refresh and retry
  if (resp.status === 401) {
    const { accessToken: fresh } = await getAccessToken(providerId); // refresh
    const retry = await axios({
      method,
      url,
      data,
      headers: { Authorization: `Zoho-oauthtoken ${fresh}` },
      timeout: 12000,
      validateStatus: s => s >= 200 && s < 500,
    });
    return retry;
  }

  return resp;
}

module.exports = { zohoRequest, getAccessToken, hosts };
