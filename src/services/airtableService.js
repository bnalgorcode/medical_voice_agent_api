const Airtable = require("airtable");
require("dotenv").config();

const { AIRTABLE_PERSONAL_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } =
  process.env;

Airtable.configure({
  apiKey: AIRTABLE_PERSONAL_TOKEN,
});

const base = Airtable.base(AIRTABLE_BASE_ID);

const getDoctors = async () => {
  const doctors = [];

  try {
    await base(AIRTABLE_TABLE_NAME)
      .select()
      .eachPage(
        function page(records, fetchNextPage) {
          console.log(`Fetched ${records.length} records`);
          records.forEach((record) => {
            doctors.push({
              id: record.id,
              name: record.get("Name") || "",
              provider_id: record.get("Provider ID") || "",
              provider_name: record.get("Name") || "",
              provider_specialty: record.get("Specialty") || "",
              medical_center: record.get("Medical Center Name") || "",
              website_url: record.get("Website URL") || "",
              contact_number: record.get("Contact Number") || "",
              contact_email: record.get("Contact Email") || "",
              office_hours: record.get("Office Hours") || "",
              address: record.get("Address") || "",
              llm: record.get("LLM") || "",
              llm_api_key: record.get("LLM Key") || "",
            });
          });
          fetchNextPage();
        },
        function done(err) {
          if (err) {
            console.error(
              "Error in .eachPage():",
              JSON.stringify(err, null, 2)
            );
            throw err;
          }
        }
      );
  } catch (err) {
    console.error(
      "Unhandled error in getDoctors():",
      JSON.stringify(err, null, 2)
    );
    throw err;
  }

  return doctors;
};
const getDoctorByProviderId = async (providerId) => {
  const doctors = [];

  try {
    await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{Provider ID} = ${providerId}`, // filter where provider_id = providerId
        maxRecords: 1,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          doctors.push({
            id: record.id,
            name: record.get("Name") || "",
            provider_id: record.get("Provider ID") || "",
            provider_name: record.get("Name") || "",
            provider_specialty: record.get("Specialty") || "",
            medical_center: record.get("Medical Center Name") || "",
            website_url: record.get("Website URL") || "",
            contact_number: record.get("Contact Number") || "",
            contact_email: record.get("Contact Email") || "",
            office_hours: record.get("Office Hours") || "",
            address: record.get("Address") || "",
            llm: record.get("LLM") || "",
            llm_api_key: record.get("LLM Key") || "",
          });
        });
        fetchNextPage();
      });

    return doctors.length > 0 ? doctors[0] : null;
  } catch (error) {
    console.error("Error fetching doctor by provider_id:", error);
    throw error;
  }
};

module.exports = {
  getDoctors,
  getDoctorByProviderId,
};
