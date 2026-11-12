const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const textToSpeech = require("@google-cloud/text-to-speech");

initializeApp();
const ttsClient = new textToSpeech.TextToSpeechClient();

exports.generatePodcast = onCall({ region: "us-central1", timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in is required to generate a briefing.");
  }

  const text = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  const narrator = request.data?.narrator === "Noah" ? "Noah" : "Maya";
  if (!text || text.length > 4000) {
    throw new HttpsError("invalid-argument", "The briefing text must contain between 1 and 4000 characters.");
  }

  const voiceName = narrator === "Noah" ? "en-US-Neural2-D" : "en-US-Neural2-F";
  try {
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: "en-US", name: voiceName },
      audioConfig: { audioEncoding: "MP3", speakingRate: 0.96, pitch: 0 }
    });
    if (!response.audioContent) {
      throw new Error("Text-to-speech returned no audio.");
    }
    return { audioBase64: Buffer.from(response.audioContent).toString("base64"), narrator };
  } catch (error) {
    console.error("Podcast synthesis failed:", error.message);
    throw new HttpsError("internal", "The audio service could not create the briefing. Check that Cloud Text-to-Speech API is enabled.");
  }
});
