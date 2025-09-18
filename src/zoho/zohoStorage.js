
const Airtable = require("airtable");
require("dotenv").config();

const {
  AIRTABLE_PERSONAL_TOKEN,
  AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_NAME,
  AIRTABLE_PROVIDER_ID_FIELD, // optional, defaults to 'provider_id'
  AIRTABLE_VIEW_NAME // optional
} = process.env;

Airtable.configure({ apiKey: AIRTABLE_PERSONAL_TOKEN });
const base = Airtable.base(AIRTABLE_BASE_ID);

function selectOpts(filterByFormula) {
  const opts = { maxRecords: 1 };
  if (AIRTABLE_VIEW_NAME) opts.view = AIRTABLE_VIEW_NAME;
  if (filterByFormula) opts.filterByFormula = filterByFormula;
  return opts;
}

function isRecordId(v) {
  return typeof v === "string" && /^rec[A-Za-z0-9]{14}$/.test(v);
}

async function tryOnce(formula) {
  return base(AIRTABLE_TABLE_NAME).select(selectOpts(formula)).all();
}

/**
 * Get a provider row by one of several possible identifier fields.
 * - If providerId looks like a RECORD_ID() (recXXXXXXXXXXXXXX), fetch by record id.
 * - Otherwise, try candidate field names and both numeric and string comparisons.
 */
async function getDoctorByProviderId(providerId) {
  const idStr = String(providerId).trim();
  if (!idStr) return null;

  if (isRecordId(idStr)) {
    const rec = await base(AIRTABLE_TABLE_NAME).find(idStr);
    return { _recordId: rec.id, ...rec.fields };
  }

  const candidates = Array.from(new Set([
    AIRTABLE_PROVIDER_ID_FIELD && AIRTABLE_PROVIDER_ID_FIELD.trim(),
    "provider_id",
    "Provider ID",
    "providerId",
    "ProviderId"
  ].filter(Boolean)));

  // Try formulas until one returns a match (or a valid 0-length result).
  for (const field of candidates) {
    const numericFormula = `{${field}} = ${Number(idStr)}`;
    const stringFormula = `{${field}} = '${idStr.replace(/'/g, "\\'")}'`;

    // Prefer exact string match first (works for text fields)
    for (const formula of [stringFormula, numericFormula]) {
      try {
        const records = await tryOnce(formula);
        if (records && records.length) {
          const rec = records[0];
          return { _recordId: rec.id, ...rec.fields };
        }
      } catch (e) {
        // If invalid field, Airtable throws INVALID_FILTER_BY_FORMULA; ignore and try next
        if (e && e.statusCode === 422) continue;
        throw e;
      }
    }
  }
  return null;
}

/**
 * Update fields on the doctor row identified by provider.
 */
async function updateDoctorFields(providerId, fields) {
  const doctor = await getDoctorByProviderId(providerId);
  if (!doctor) throw new Error("Provider not found to update");
  const recId = doctor._recordId;
  const updated = await base(AIRTABLE_TABLE_NAME).update([{ id: recId, fields }]);
  return updated[0].fields;
}

module.exports = { getDoctorByProviderId, updateDoctorFields };
