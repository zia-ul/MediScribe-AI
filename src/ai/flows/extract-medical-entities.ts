'use server';

/**
 * @fileOverview A flow for extracting medical entities from a transcript.
 *
 * - extractMedicalEntities - A function that extracts medical entities from a transcript.
 * - ExtractMedicalEntitiesInput - The input type for the extractMedicalEntities function.
 * - ExtractMedicalEntitiesOutput - The return type for the extractMedicalEntities function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractMedicalEntitiesInputSchema = z.object({
  transcript: z.string().describe('The transcript of the doctor-patient conversation.'),
});
export type ExtractMedicalEntitiesInput = z.infer<typeof ExtractMedicalEntitiesInputSchema>;

const ExtractMedicalEntitiesOutputSchema = z.object({
  symptoms: z.array(z.string()).describe('The symptoms mentioned in the transcript.'),
  medications: z.array(z.string()).describe('The medications mentioned in the transcript.'),
  medicalHistory: z.array(z.string()).describe('The medical history mentioned in the transcript.'),
});
export type ExtractMedicalEntitiesOutput = z.infer<typeof ExtractMedicalEntitiesOutputSchema>;

export async function extractMedicalEntities(input: ExtractMedicalEntitiesInput): Promise<ExtractMedicalEntitiesOutput> {
  return extractMedicalEntitiesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractMedicalEntitiesPrompt',
  input: {schema: ExtractMedicalEntitiesInputSchema},
  output: {schema: ExtractMedicalEntitiesOutputSchema},
  prompt: `You are a medical NLP expert. Your task is to extract medical entities from the given transcript. Specifically, extract symptoms, medications, and medical history.

Transcript: {{{transcript}}}

Output the symptoms, medications and medical history in JSON format.

Example:
{
  "symptoms": ["cough", "fever", "headache"],
  "medications": ["Tylenol", "Amoxicillin"],
  "medicalHistory": ["asthma", "diabetes"]
}
`,
});

const extractMedicalEntitiesFlow = ai.defineFlow(
  {
    name: 'extractMedicalEntitiesFlow',
    inputSchema: ExtractMedicalEntitiesInputSchema,
    outputSchema: ExtractMedicalEntitiesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
