'use server';

/**
 * @fileOverview A flow to handle a chat conversation between a doctor and a patient.
 *
 * - doctorPatientChat - A function that handles the chat conversation.
 * - DoctorPatientChatInput - The input type for the doctorPatientChat function.
 * - DoctorPatientChatOutput - The return type for the doctorPatientChat function.
 */

import { ai } from '@/ai/genkit';
import { z, generate } from 'genkit';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const DoctorPatientChatInputSchema = z.object({
  history: z.array(MessageSchema).describe('The conversation history.'),
});
export type DoctorPatientChatInput = z.infer<typeof DoctorPatientChatInputSchema>;
export type ChatHistory = DoctorPatientChatInput['history'];

const DoctorPatientChatOutputSchema = z.object({
  response: z.string().describe("The doctor's response to the patient."),
});
export type DoctorPatientChatOutput = z.infer<
  typeof DoctorPatientChatOutputSchema
>;

export async function doctorPatientChat(
  input: DoctorPatientChatInput
): Promise<DoctorPatientChatOutput> {
  return doctorPatientChatFlow(input);
}

const systemPrompt = `You are a compassionate and knowledgeable doctor. Your role is to converse with a patient (the user) to understand their symptoms and concerns. Be professional, empathetic, and clear in your communication. Ask clarifying questions to gather necessary medical information. The user is the patient.`;

const doctorPatientChatFlow = ai.defineFlow(
  {
    name: 'doctorPatientChatFlow',
    inputSchema: DoctorPatientChatInputSchema,
    outputSchema: DoctorPatientChatOutputSchema,
  },
  async (input) => {
    const llmResponse = await generate({
      model: 'googleai/gemini-pro',
      prompt: input.history[input.history.length - 1].content,
      history: input.history.slice(0, -1),
      config: {
        // @ts-ignore
        systemInstruction: systemPrompt,
      },
      output: {
        schema: z.object({
          response: z.string(),
        })
      }
    });

    const output = llmResponse.output();
    if (!output) {
      throw new Error("No output from LLM");
    }
    return {
      response: output.response,
    };
  }
);
