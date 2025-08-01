import { config } from 'dotenv';
config();

import '@/ai/flows/generate-soap-note.ts';
import '@/ai/flows/transcribe-doctor-patient-conversation.ts';
import '@/ai/flows/extract-medical-entities.ts';
import '@/ai/flows/doctor-patient-chat.ts';
import '@/ai/flows/text-to-speech.ts';
