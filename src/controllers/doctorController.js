const {
  getDoctors,
  getDoctorByProviderId,
} = require("../services/airtableService");

async function fetchDoctors(req, res) {
  try {
    const doctors = await getDoctors();
    res.status(200).json(doctors);
  } catch (error) {
    console.error("Error fetching doctors:", error);
    res.status(500).json({ error: "Failed to fetch doctors" });
  }
}

async function fetchDoctorByProviderId(req, res) {
  try {
    const providerId = Number(req.params.providerId);
    if (isNaN(providerId)) {
      return res.status(400).json({ error: "Invalid providerId" });
    }
    const doctor = await getDoctorByProviderId(providerId);
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }
    res.status(200).json(doctor);
  } catch (error) {
    console.error("Error fetching doctor by provider_id:", error);
    res.status(500).json({ error: "Failed to fetch doctor by provider_id" });
  }
}

const axios = require("axios");

async function askDoctorLLM(req, res) {
  const providerId = parseInt(req.params.providerId, 10);
  const { question } = req.body;
  console.log("question >>", question);
  if (isNaN(providerId) || !question || typeof question !== "string") {
    return res
      .status(400)
      .json({ error: "Invalid provider ID or missing question" });
  }

  try {
    const doctor = await getDoctorByProviderId(providerId);
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const { llm, llm_api_key, provider_name, provider_specialty } = doctor;
    if (!llm || !llm_api_key) {
      return res
        .status(400)
        .json({ error: "Doctor is not configured with an LLM or API key" });
    }

    let reply;
    if (llm === "BastionGPT") {
      // Build request payload and headers as per BastionGPT API spec
      const payload = {
        messages: [
          { role: "system", content: `You are a helpful medical assistant for Dr.${provider_name}, who specializes in ${provider_specialty}.\n Always respond as the utmost professional, polite, and ${provider_specialty} with the goal of helping clients, and  assisting clients answer their questions and guiding  them to get information they need.` },
          { role: "user", content: question }
        ],
        // optional parameters
        // temperature: 0.7,
        // user: `<some tag>`,
      };

      const headers = {
        "Content-Type": "application/json",
        Key: llm_api_key,
        Function: "general",
        Host: "api.bastiongpt.com",
      };

      const response = await axios.post(
        "https://api.bastiongpt.com/v1/ChatCompletion",
        payload,
        { headers }
      );
      // Extract the content out of response
      if (
        response.data &&
        Array.isArray(response.data.choices) &&
        response.data.choices[0] &&
        response.data.choices[0].message &&
        typeof response.data.choices[0].message.content === "string"
      ) {
        reply = response.data.choices[0].message.content;
      } else {
        console.error("Unexpected BastionGPT response format:", response.data);
        reply = null;
      }
    } else if (llm === "OpenAI") {
      const payload = {
        model: "gpt-4",
        messages: [
          { role: "system", content: `You are a helpful medical assistant for Dr.${provider_name}, who specializes in ${provider_specialty}.\n Always respond as the utmost professional, polite, and ${provider_specialty} with the goal of helping clients, and  assisting clients answer their questions and guiding  them to get information they need.` },
          { role: "user", content: question },
        ],
      };

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${llm_api_key}`,
          },
        }
      );

      if (
        response.data &&
        Array.isArray(response.data.choices) &&
        response.data.choices[0] &&
        response.data.choices[0].message &&
        typeof response.data.choices[0].message.content === "string"
      ) {
        reply = response.data.choices[0].message.content;
      } else {
        console.error("Unexpected OpenAI response format:", response.data);
        reply = null;
      }
    } else {
      return res.status(400).json({ error: `Unsupported LLM type: ${llm}` });
    }

    if (!reply) {
      return res
        .status(500)
        .json({ error: "LLM did not return a valid reply" });
    }

    res.json({ reply });
  } catch (err) {
    // More detailed logging
    console.error("Error in askDoctorLLM:", {
      message: err.message,
      responseData: err.response?.data,
    });
    res.status(500).json({ error: "Failed to get response from LLM" });
  }
}

module.exports = {
  fetchDoctors,
  fetchDoctorByProviderId,
  askDoctorLLM,
};
