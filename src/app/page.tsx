"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { FC, ChangeEvent, FormEvent } from "react";
import {
  Mic,
  StopCircle,
  Loader,
  HeartPulse,
  Pill,
  ClipboardList,
  Stethoscope,
  Upload,
  Bot,
  User,
  Send,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { analyzeTranscript, transcribeAudio, chatWithBot } from "@/app/actions";
import type { ExtractMedicalEntitiesOutput } from "@/ai/flows/extract-medical-entities";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { ChatHistory } from "@/ai/flows/doctor-patient-chat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Status = "idle" | "recording" | "transcribing" | "analyzing" | "error" | "chatting";

const StatusIndicator: FC<{ status: Status }> = ({ status }) => {
  const statusConfig = {
    idle: { text: "Ready", color: "bg-gray-500" },
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
    chatting: {
        text: "AI is thinking...",
        color: "bg-purple-500",
        icon: <Loader className="animate-spin" />,
    },
    error: { text: "Error occurred", color: "bg-red-700" },
  };

  const current = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${current.color}`} />
      <span className="text-sm text-muted-foreground">{current.text}</span>
      {current.icon ? (
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
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const [chatHistory, setChatHistory] = useState<ChatHistory>([]);
  const [chatInput, setChatInput] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  const clearAll = () => {
    setTranscript(null);
    setEntities(null);
    setSoapNote(null);
    setAudioURL(null);
    if (chatHistory.length > 0) {
      setChatHistory([]);
    }
    setChatInput("");
    setStatus("idle");
  };

  useEffect(() => {
    const getMicPermission = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true);
      } catch (error) {
        console.error("Error accessing microphone:", error);
        setHasMicPermission(false);
        toast({
          variant: "destructive",
          title: "Microphone Access Denied",
          description: "Please allow microphone access in your browser settings to use this feature.",
        });
      }
    };
    getMicPermission();
  }, [toast]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);


  const runAnalysis = useCallback(async (text: string) => {
    setStatus("analyzing");
    try {
        const analysisResult = await analyzeTranscript({ transcript: text });
        setEntities(analysisResult.entities);
        setSoapNote(analysisResult.soapNote);
        setStatus("idle");
    } catch (error) {
        console.error(error);
        setStatus("error");
        toast({
            variant: "destructive",
            title: "Analysis Failed",
            description: "Could not analyze the transcript. Please try again.",
        });
    }
  }, [toast]);

  useEffect(() => {
    const runInitialAnalysis = async () => {
      if (isInitialMount.current && chatHistory.length > 0) {
        const fullTranscript = chatHistory
          .map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`)
          .join('\n');
        setTranscript(fullTranscript);
        await runAnalysis(fullTranscript);
        isInitialMount.current = false;
      }
    };
    if (isInitialMount.current) {
        const initialChat: ChatHistory = [
            { role: "model", content: "Good morning, Mr. Adams. What brings you in today?" },
            { role: "user", content: "Morning, Doctor. I've been having a constant headache for the past few days. It's dull but doesn’t go away." },
            { role: "model", content: "I see. On a scale of 1 to 10, how painful would you say it is?" },
            { role: "user", content: "Around a 4 or 5. It's not unbearable, but it’s very annoying and distracting." },
            { role: "model", content: "Got it. Have you had any other symptoms? Fever, nausea, vision changes?" },
            { role: "user", content: "Not really. Just the headache and a bit of tiredness." },
            { role: "model", content: "Alright. I’ll check your blood pressure and do a quick neurological exam. Have you been under more stress than usual lately?" },
            { role: "user", content: "Yeah, work’s been pretty intense. I haven’t been sleeping much either." },
            { role: "model", content: "That could definitely be contributing. Let’s run a few tests to rule out anything serious, and I’ll also give you some advice on managing stress and sleep. Sound good?" },
            { role: "user", content: "Sounds good. Thanks, Doctor." },
        ];
        setChatHistory(initialChat);
    }
    runInitialAnalysis();
  }, [runAnalysis, chatHistory.length]);

  const processAudio = useCallback(async (base64Audio: string, audioBlobUrl: string) => {
    setAudioURL(audioBlobUrl);
    setTranscript(null);
    setEntities(null);
    setSoapNote(null);
    if (chatHistory.length > 0) {
      setChatHistory([]);
    }

    setStatus("transcribing");
    try {
      const transcriptionResult = await transcribeAudio({ audioDataUri: base64Audio });
      if (transcriptionResult.transcript) {
        setTranscript(transcriptionResult.transcript);
        await runAnalysis(transcriptionResult.transcript);
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
  }, [toast, runAnalysis, chatHistory.length]);

  const handleStartRecording = useCallback(async () => {
    if (!hasMicPermission) {
      toast({
          variant: "destructive",
          title: "Microphone Access Required",
          description: "Please allow microphone access to record audio.",
        });
      return;
    }
    clearAll();
    setStatus("recording");
    audioChunks.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      
      mediaRecorder.current.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      });

      mediaRecorder.current.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunks.current, { type: mediaRecorder.current?.mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          processAudio(base64Audio, audioUrl);
          stream.getTracks().forEach(track => track.stop());
        };
      });

      mediaRecorder.current.start();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setStatus("error");
      toast({
        variant: "destructive",
        title: "Microphone Access Denied",
        description: "Please allow microphone access in your browser settings to use this feature.",
      });
    }
  }, [toast, processAudio, hasMicPermission]);

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
      clearAll();
      const audioUrl = URL.createObjectURL(file);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        await processAudio(base64Audio, audioUrl);
      };
      event.target.value = "";
    }
  };

  const handleChatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || status === 'chatting') return;

    const newHistory: ChatHistory = [...chatHistory, { role: "user", content: chatInput }];
    setChatHistory(newHistory);
    setChatInput("");
    setStatus("chatting");

    try {
        const result = await chatWithBot({ history: newHistory });
        setChatHistory(prev => [...prev, { role: "model", content: result.response }]);
        const fullTranscript = [...newHistory, { role: "model", content: result.response }]
            .map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`)
            .join('\n');
        setTranscript(fullTranscript);
        await runAnalysis(fullTranscript);
    } catch (error) {
        console.error("Chat failed:", error);
        setStatus("error");
        toast({
            variant: "destructive",
            title: "Chatbot Error",
            description: "The chatbot encountered an error. Please try again.",
        });
    } finally {
        setStatus("idle");
    }
  };

  const parsedSoapNote = parseSoapNote(soapNote);

  const isWorking = status === "recording" || status === "transcribing" || status === "analyzing" || status === "chatting";


  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 border-b bg-card shadow-sm">
        <div className="flex items-center gap-3">
          <Stethoscope className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold font-headline tracking-tight">MediScribe AI</h1>
        </div>
        <div className="flex items-center gap-4">
          <StatusIndicator status={status} />
          {(transcript || chatHistory.length > 0 || audioURL) && (
            <Button onClick={clearAll} variant="ghost" size="icon" className="h-8 w-8">
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Clear Session</span>
            </Button>
          )}
        </div>
      </header>
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-auto">
        <div className="flex flex-col gap-6">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat">Chatbot</TabsTrigger>
              <TabsTrigger value="audio">Audio Input</TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 flex flex-col gap-4 mt-4">
              <Card className="flex-1 flex flex-col">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Bot /> Doctor-Patient Chat</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                    <ScrollArea className="flex-grow h-64 pr-4" ref={chatContainerRef}>
                        <div className="space-y-4">
                        {chatHistory.map((msg, index) => (
                          <div key={index} className={cn("flex items-start gap-3", msg.role === 'user' ? 'justify-end' : '')}>
                              {msg.role === 'model' && <Avatar><AvatarFallback><Bot /></AvatarFallback></Avatar>}
                              <div className={cn("rounded-lg px-4 py-2 max-w-sm", msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                                  <p className="text-sm">{msg.content}</p>
                              </div>
                              {msg.role === 'user' && <Avatar><AvatarFallback><User /></AvatarFallback></Avatar>}
                          </div>
                        ))}
                        {status === 'chatting' && (
                            <div className="flex items-start gap-3">
                                <Avatar><AvatarFallback><Bot /></AvatarFallback></Avatar>
                                <div className="rounded-lg px-4 py-2 max-w-sm bg-muted flex items-center">
                                    <Loader className="h-5 w-5 animate-spin" />
                                </div>
                            </div>
                        )}
                        {status !== 'chatting' && chatHistory.length === 0 && (
                            <p className="text-muted-foreground italic text-center">Start the conversation by typing a message below.</p>
                        )}
                        </div>
                    </ScrollArea>
                    <form onSubmit={handleChatSubmit} className="flex items-center gap-2">
                      <Textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type your message as the patient..."
                        className="flex-1"
                        rows={1}
                        onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { handleChatSubmit(e); e.preventDefault(); } }}
                        disabled={status === 'chatting'}
                      />
                      <Button type="submit" disabled={!chatInput.trim() || status === 'chatting'}>
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Send</span>
                      </Button>
                    </form>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="audio" className="flex-1 flex flex-col gap-4 mt-4">
               <Card>
                <CardHeader><CardTitle>Record or Upload</CardTitle></CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-4 p-6">
                    {!hasMicPermission && (
                      <Alert variant="destructive">
                        <AlertTitle>Microphone Access Required</AlertTitle>
                        <AlertDescription>
                          Please allow microphone access in your browser settings to use the recording feature.
                        </AlertDescription>
                      </Alert>
                    )}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="audio/*"
                        className="hidden"
                      />
                      {status !== "recording" ? (
                        <div className="flex items-center justify-center gap-4">
                          <Button onClick={handleStartRecording} disabled={isWorking || !hasMicPermission}>
                            <Mic className="mr-2 h-4 w-4" />
                            Start Recording
                          </Button>
                          <Button onClick={handleUploadClick} disabled={isWorking} variant="outline">
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Audio
                          </Button>
                        </div>
                      ) : (
                        <Button variant="destructive" onClick={handleStopRecording}>
                          <StopCircle className="mr-2 h-4 w-4" />
                          Stop Recording
                        </Button>
                      )}
                      {audioURL && (
                          <div className="w-full pt-4">
                              <h4 className="text-sm font-medium mb-2 text-center">Captured Audio</h4>
                              <audio src={audioURL} controls className="w-full" />
                          </div>
                      )}
                </CardContent>
               </Card>
            </TabsContent>
          </Tabs>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle>Conversation Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {(isWorking && !transcript) || (status === 'transcribing') ? (
                <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                </div>
              ) : transcript ? (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={highlightText(transcript, entities)}
                />
              ) : (
                <p className="text-muted-foreground italic">
                  Start a session to see the transcript.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Medical Entities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(isWorking && !entities) || (status === 'analyzing') ? (<div className="space-y-4">
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

          <Card className="flex-1 lg:max-h-[calc(100vh-18rem)] overflow-y-auto">
            <CardHeader>
              <CardTitle>Generated SOAP Note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(isWorking && !soapNote) || (status === 'analyzing') ? (<div className="space-y-6">
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
        </div>
      </main>
    </div>
  );
}
