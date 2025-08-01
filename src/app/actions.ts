"use server";

import {
  transcribeDoctorPatientConversation,
  TranscribeInput,
} from "@/ai/flows/transcribe-doctor-patient-conversation";
import {
  extractMedicalEntities,
  ExtractMedicalEntitiesInput,
} from "@/ai/flows/extract-medical-entities";
import {
  generateSoapNote,
  GenerateSoapNoteInput,
} from "@/ai/flows/generate-soap-note";
import {
    doctorPatientChat,
    DoctorPatientChatInput
} from "@/ai/flows/doctor-patient-chat";
import {
    textToSpeech,
    TextToSpeechInput,
} from "@/ai/flows/text-to-speech";

export async function transcribeAudio(input: TranscribeInput) {
  try {
    const result = await transcribeDoctorPatientConversation(input);
    return result;
  } catch (error) {
    console.error("Transcription failed:", error);
    throw new Error("Failed to transcribe audio.");
  }
}

export async function analyzeTranscript(input: {
  transcript: string;
}): Promise<{ entities: any; soapNote: any }> {
  try {
    const [entitiesResult, soapNoteResult] = await Promise.all([
      extractMedicalEntities(input),
      generateSoapNote(input),
    ]);

    return {
      entities: entitiesResult,
      soapNote: soapNoteResult.soapNote,
    };
  } catch (error) {
    console.error("Analysis failed:", error);
    throw new Error("Failed to analyze transcript.");
  }
}

export async function chatWithBot(input: DoctorPatientChatInput) {
    try {
        const result = await doctorPatientChat(input);
        return result;
    } catch (error) {
        console.error("Chat failed:", error);
        throw new Error("Failed to get response from chat bot.");
    }
}

export async function convertTextToSpeech(input: TextToSpeechInput) {
    try {
        const result = await textToSpeech(input);
        return result;
    } catch (error) {
        console.error("TTS failed:", error);
        throw new Error("Failed to convert text to speech.");
    }
}
