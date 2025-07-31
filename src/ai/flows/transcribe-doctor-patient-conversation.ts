'use server';
/**
 * @fileOverview A flow to transcribe doctor-patient conversations in real-time.
 *
 * - transcribeDoctorPatientConversation - A function that handles the transcription process.
 * - TranscribeInput - The input type for the transcribeDoctorPatientConversation function.
 * - TranscribeOutput - The return type for the transcribeDoctorPatientConversation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TranscribeInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "Audio data of the doctor-patient conversation, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type TranscribeInput = z.infer<typeof TranscribeInputSchema>;

const TranscribeOutputSchema = z.object({
  transcript: z.string().describe('The transcript of the doctor-patient conversation.'),
});
export type TranscribeOutput = z.infer<typeof TranscribeOutputSchema>;

export async function transcribeDoctorPatientConversation(input: TranscribeInput): Promise<TranscribeOutput> {
  return transcribeFlow(input);
}

const transcribePrompt = ai.definePrompt({
  name: 'transcribePrompt',
  input: {schema: TranscribeInputSchema},
  output: {schema: TranscribeOutputSchema},
  prompt: `Transcribe the following doctor-patient conversation from the given audio data.  Return only the transcript. 

Audio: {{media url=audioDataUri}}`,
});

const transcribeFlow = ai.defineFlow(
  {
    name: 'transcribeFlow',
    inputSchema: TranscribeInputSchema,
    outputSchema: TranscribeOutputSchema,
  },
  async input => {
    const {output} = await transcribePrompt(input);
    return output!;
  }
);
