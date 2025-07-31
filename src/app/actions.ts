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
