'use server';

/**
 * @fileOverview Generates a SOAP note from a doctor-patient conversation transcript.
 *
 * - generateSoapNote - A function that generates a SOAP note.
 * - GenerateSoapNoteInput - The input type for the generateSoapNote function.
 * - GenerateSoapNoteOutput - The return type for the generateSoapNote function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateSoapNoteInputSchema = z.object({
  transcript: z
    .string()
    .describe('The transcript of the doctor-patient conversation.'),
});
export type GenerateSoapNoteInput = z.infer<typeof GenerateSoapNoteInputSchema>;

const GenerateSoapNoteOutputSchema = z.object({
  soapNote: z.string().describe('The generated SOAP note.'),
});
export type GenerateSoapNoteOutput = z.infer<typeof GenerateSoapNoteOutputSchema>;

export async function generateSoapNote(input: GenerateSoapNoteInput): Promise<GenerateSoapNoteOutput> {
  return generateSoapNoteFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateSoapNotePrompt',
  input: {schema: GenerateSoapNoteInputSchema},
  output: {schema: GenerateSoapNoteOutputSchema},
  prompt: `You are an AI assistant that generates SOAP notes from doctor-patient conversation transcripts. A SOAP note is a structured medical note that includes the following sections:

- Subjective (S): The patient's narrative and symptoms.
- Objective (O): The doctor's observations, vitals, and test results.
- Assessment (A): The doctor's preliminary diagnosis.
- Plan (P): The next steps, including tests, medications, and follow-up appointments.

Given the following transcript, generate a SOAP note.

Transcript: {{{transcript}}}`,
});

const generateSoapNoteFlow = ai.defineFlow(
  {
    name: 'generateSoapNoteFlow',
    inputSchema: GenerateSoapNoteInputSchema,
    outputSchema: GenerateSoapNoteOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
