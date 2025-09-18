const { upsertPatient } = require("../services/patientsService");

async function createOrUpdatePatient(req, res) {
  try {
    const body = req.body || {};
    const provider_id = body.provider_id || body.provider || body.doctor_id || body.pid;
    const fname = body.fname || body.first_name || body.firstName || (body.name ? String(body.name).split(" ")[0] : undefined);
    const lname = body.lname || body.last_name  || body.lastName  || (body.name ? String(body.name).split(" ").slice(1).join(" ") : undefined);
    const email = body.email || body.user_email || body.contact_email;
    const phone = body.phone || body.user_phone || body.contact_phone;
    const service = body.service || body.requested_service || body.reason;

    if (!fname || !lname) return res.status(400).json({ error: "Missing fname/lname" });
    if (!email && !phone) return res.status(400).json({ error: "Provide at least email or phone" });

    const result = await upsertPatient({ provider_id, fname, lname, email, phone, service });
    return res.json({ ok: true, patient_id: result.id, created: result.created, patient: result.fields });
  } catch (err) {
    console.error("createOrUpdatePatient error:", err);
    return res.status(500).json({ error: "Failed to upsert patient" });
  }
}

module.exports = { createOrUpdatePatient };
