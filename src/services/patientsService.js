const Airtable = require("airtable");
require("dotenv").config();
const { getDoctorByProviderId } = require("./airtableService");

const {
  AIRTABLE_PERSONAL_TOKEN,
  AIRTABLE_BASE_ID,
  AIRTABLE_PATIENTS_TABLE_NAME = "Patients",
} = process.env;

if (!AIRTABLE_PERSONAL_TOKEN || !AIRTABLE_BASE_ID) {
  console.warn("[patientsService] Missing Airtable env (AIRTABLE_PERSONAL_TOKEN/AIRTABLE_BASE_ID)");
}

Airtable.configure({ apiKey: AIRTABLE_PERSONAL_TOKEN });
const base = Airtable.base(AIRTABLE_BASE_ID);

function digitsOnly(s) {
  return (s || "").replace(/\D/g, "");
}

async function upsertPatient({ provider_id, fname, lname, email, phone, service }) {
  const table = AIRTABLE_PATIENTS_TABLE_NAME;
  const emailLower = (email || "").toLowerCase().trim();
  const phoneDigits = digitsOnly(phone);

  let existing = null;
  const filters = [];
  if (emailLower) filters.push(`LOWER({Email}) = '${emailLower.replace(/'/g, "\\'")}'`);
  if (phoneDigits) filters.push(`REGEX_REPLACE({Phone}, "[^0-9]", "") = '${phoneDigits}'`);
  const formula = filters.length ? (filters.length > 1 ? `OR(${filters.join(",")})` : filters[0]) : null;

  try {
    if (formula) {
      const recs = await base(table).select({ maxRecords: 1, filterByFormula: formula }).all();
      if (recs.length) existing = recs[0];
    }
  } catch (e) { /* ignore */ }

  const doctor = await getDoctorByProviderId(provider_id);

  const fields = {
    "First Name": fname || undefined,
    "Last Name": lname || undefined,
    "Email": email || undefined,
    "Phone Number": phone || undefined,
    "Service": service || undefined,
    "Doctors": doctor ? [doctor.id] : undefined
  };

  if (existing) {
    const updated = await base(table).update([{ id: existing.id, fields }]);
    return { id: updated[0].id, created: false, fields: updated[0].fields };
  } else {
    const created = await base(table).create([{ fields }]);
    return { id: created[0].id, created: true, fields: created[0].fields };
  }
}

module.exports = { upsertPatient };
