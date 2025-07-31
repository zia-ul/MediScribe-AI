"use client";

import { useState, useRef, useCallback } from "react";
import type { FC, ChangeEvent } from "react";
import {
  Mic,
  StopCircle,
  Loader,
  HeartPulse,
  Pill,
  ClipboardList,
  Stethoscope,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { analyzeTranscript, transcribeAudio } from "@/app/actions";
import type { ExtractMedicalEntitiesOutput } from "@/ai/flows/extract-medical-entities";
import { Skeleton } from "@/components/ui/skeleton";

type Status = "idle" | "recording" | "transcribing" | "analyzing" | "error";

const StatusIndicator: FC<{ status: Status }> = ({ status }) => {
  const statusConfig = {
    idle: { text: "Ready to record", color: "bg-gray-500" },
    recording: { text: "Recording...", color: "bg-red-500 animate-pulse" },
    transcribing: {
      text: "Transcribing...",
      color: "bg-yellow-500",
      icon: <Loader className="animate-spin" />,
    },
    analyzing: {
      text: "Analyzing...",
      color: "bg-blue-500",
      icon: <Loader className="animate-spin" />,
    },
    error: { text: "Error occurred", color: "bg-red-700" },
  };

  const current = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${current.color}`} />
      <span className="text-sm text-muted-foreground">{current.text}</span>
      {status === "transcribing" || status === "analyzing" ? (
        <Loader className="ml-2 h-4 w-4 animate-spin" />
      ) : null}
    </div>
  );
};

const highlightText = (
  transcript: string,
  entities: ExtractMedicalEntitiesOutput | null
): { __html: string } => {
  if (!transcript || !entities) return { __html: transcript };

  let highlighted = transcript;

  const entityMap = new Map<string, string>();
  entities.symptoms.forEach(s => entityMap.set(s.toLowerCase(), 'bg-blue-100 text-blue-800'));
  entities.medications.forEach(m => entityMap.set(m.toLowerCase(), 'bg-green-100 text-green-800'));
  entities.medicalHistory.forEach(h => entityMap.set(h.toLowerCase(), 'bg-purple-100 text-purple-800'));
  
  const allEntities = [...entities.symptoms, ...entities.medications, ...entities.medicalHistory];

  allEntities.sort((a, b) => b.length - a.length);

  const uniqueEntities = new Set(allEntities.map(e => e.toLowerCase()));

  uniqueEntities.forEach(entityText => {
    const className = entityMap.get(entityText) || '';
    const regex = new RegExp(`\\b(${entityText})\\b`, "gi");
    highlighted = highlighted.replace(
      regex,
      `<span class="px-1.5 py-0.5 rounded-md font-semibold ${className}">$1</span>`
    );
  });


  return { __html: highlighted.replace(/\n/g, '<br />') };
};


const parseSoapNote = (
  note: string | null
): { S: string; O: string; A: string; P: string } => {
  const sections = { S: "", O: "", A: "", P: "" };
  if (!note) return sections;

  const lines = note.split("\n");
  let currentSection: "S" | "O" | "A" | "P" | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("S:") || trimmedLine.startsWith("Subjective:")) {
      currentSection = "S";
      sections.S += trimmedLine.substring(trimmedLine.indexOf(":") + 1).trim() + " ";
    } else if (trimmedLine.startsWith("O:") || trimmedLine.startsWith("Objective:")) {
      currentSection = "O";
      sections.O += trimmedLine.substring(trimmedLine.indexOf(":") + 1).trim() + " ";
    } else if (trimmedLine.startsWith("A:") || trimmedLine.startsWith("Assessment:")) {
      currentSection = "A";
      sections.A += trimmedLine.substring(trimmedLine.indexOf(":") + 1).trim() + " ";
    } else if (trimmedLine.startsWith("P:") || trimmedLine.startsWith("Plan:")) {
      currentSection = "P";
      sections.P += trimmedLine.substring(trimmedLine.indexOf(":") + 1).trim() + " ";
    } else if (currentSection && trimmedLine) {
      sections[currentSection] += trimmedLine + " ";
    }
  }

  Object.keys(sections).forEach(key => {
    sections[key as keyof typeof sections] = sections[
      key as keyof typeof sections
    ].trim();
  });

  return sections;
};

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [entities, setEntities] = useState<ExtractMedicalEntitiesOutput | null>(
    null
  );
  const [soapNote, setSoapNote] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const processAudio = useCallback(async (base64Audio: string) => {
    setStatus("transcribing");
    try {
      const transcriptionResult = await transcribeAudio({ audioDataUri: base64Audio });
      if (transcriptionResult.transcript) {
        setTranscript(transcriptionResult.transcript);
        setStatus("analyzing");
        const analysisResult = await analyzeTranscript({ transcript: transcriptionResult.transcript });
        setEntities(analysisResult.entities);
        setSoapNote(analysisResult.soapNote);
        setStatus("idle");
      } else {
        throw new Error("Transcription failed.");
      }
    } catch (error) {
      console.error(error);
      setStatus("error");
      toast({
        variant: "destructive",
        title: "AI Analysis Failed",
        description: "Could not process the audio. Please try again.",
      });
    }
  }, [toast]);

  const handleStartRecording = useCallback(async () => {
    setTranscript(null);
    setEntities(null);
    setSoapNote(null);
    setStatus("recording");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.current.ondataavailable = event => {
        audioChunks.current.push(event.data);
      };
      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, {
          type: "audio/webm",
        });
        audioChunks.current = [];
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await processAudio(base64Audio);
        };
      };
      mediaRecorder.current.start();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setStatus("error");
      toast({
        variant: "destructive",
        title: "Microphone Access Denied",
        description:
          "Please allow microphone access in your browser settings to use this feature.",
      });
    }
  }, [toast, processAudio]);

  const handleStopRecording = useCallback(() => {
    if (
      mediaRecorder.current &&
      mediaRecorder.current.state === "recording"
    ) {
      mediaRecorder.current.stop();
    }
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setTranscript(null);
      setEntities(null);
      setSoapNote(null);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        await processAudio(base64Audio);
      };
      // Reset file input
      event.target.value = "";
    }
  };

  const parsedSoapNote = parseSoapNote(soapNote);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 border-b bg-card shadow-sm">
        <div className="flex items-center gap-3">
          <Stethoscope className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold font-headline tracking-tight">MediScribe AI</h1>
        </div>
        <div className="flex items-center gap-4">
          <StatusIndicator status={status} />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*"
            className="hidden"
          />
          {status !== "recording" ? (
            <>
              <Button onClick={handleStartRecording} disabled={status !== "idle" && status !== "error"}>
                <Mic className="mr-2 h-4 w-4" />
                Start Recording
              </Button>
              <Button onClick={handleUploadClick} disabled={status !== "idle" && status !== "error"} variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Upload Audio
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={handleStopRecording}>
              <StopCircle className="mr-2 h-4 w-4" />
              Stop Recording
            </Button>
          )}
        </div>
      </header>
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-auto">
        <div className="flex flex-col gap-6">
          <Card className="flex-1">
            <CardHeader>
              <CardTitle>Conversation Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {status === 'transcribing' || status === 'analyzing' || (transcript && (status === 'idle' || status === 'error')) ? (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={highlightText(transcript || "Analyzing transcript...", entities)}
                />
              ) : status === 'recording' ? (
                <p className="text-muted-foreground italic">Recording in progress...</p>
              ) : (
                <p className="text-muted-foreground italic">
                  Click &quot;Start Recording&quot; or &quot;Upload Audio&quot; to begin a session.
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Extracted Medical Entities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {status === 'analyzing' ? (<div className="space-y-4">
                <Skeleton className="h-8 w-1/3" />
                <div className="flex flex-wrap gap-2"><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-6 w-24 rounded-full" /></div>
                <Skeleton className="h-8 w-1/3" />
                <div className="flex flex-wrap gap-2"><Skeleton className="h-6 w-20 rounded-full" /></div>
              </div>) : entities ? (
                <>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold mb-2"><HeartPulse className="h-5 w-5 text-blue-500" /> Symptoms</h3>
                  <div className="flex flex-wrap gap-2">
                    {entities.symptoms.length > 0 ? entities.symptoms.map(s => <Badge key={s} variant="secondary" className="bg-blue-100 text-blue-800">{s}</Badge>) : <p className="text-sm text-muted-foreground">None identified.</p>}
                  </div>
                </div>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold mb-2"><Pill className="h-5 w-5 text-green-500" /> Medications</h3>
                  <div className="flex flex-wrap gap-2">
                    {entities.medications.length > 0 ? entities.medications.map(m => <Badge key={m} variant="secondary" className="bg-green-100 text-green-800">{m}</Badge>) : <p className="text-sm text-muted-foreground">None identified.</p>}
                  </div>
                </div>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold mb-2"><ClipboardList className="h-5 w-5 text-purple-500" /> Medical History</h3>
                  <div className="flex flex-wrap gap-2">
                    {entities.medicalHistory.length > 0 ? entities.medicalHistory.map(h => <Badge key={h} variant="secondary" className="bg-purple-100 text-purple-800">{h}</Badge>) : <p className="text-sm text-muted-foreground">None identified.</p>}
                  </div>
                </div>
                </>
              ) : (
                <p className="text-muted-foreground italic">No entities extracted yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:max-h-[calc(100vh-10rem)] overflow-y-auto">
          <CardHeader>
            <CardTitle>Generated SOAP Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'analyzing' ? (<div className="space-y-6">
              <div><Skeleton className="h-6 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
              <div><Skeleton className="h-6 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
              <div><Skeleton className="h-6 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /></div>
              <div><Skeleton className="h-6 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/2" /></div>
            </div>) : soapNote ? (
              <>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-primary">Subjective (S)</h3>
                  <p className="prose prose-sm max-w-none text-foreground">{parsedSoapNote.S || "No subjective information generated."}</p>
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-primary">Objective (O)</h3>
                  <p className="prose prose-sm max-w-none text-foreground">{parsedSoapNote.O || "No objective information generated."}</p>
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-primary">Assessment (A)</h3>
                  <p className="prose prose-sm max-w-none text-foreground">{parsedSoapNote.A || "No assessment generated."}</p>
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-primary">Plan (P)</h3>
                  <p className="prose prose-sm max-w-none text-foreground">{parsedSoapNote.P || "No plan generated."}</p>
                </div>
              </>
            ) : (
               <p className="text-muted-foreground italic">SOAP note will be generated after transcription and analysis.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
