import { AIAssistant } from "@/components/AIAssistant";

/** Development-only harness: exercises the real chat without a signed-in account. */
export default function AIChatE2E() {
  return <AIAssistant open onClose={() => {}} activeEntry={null} allEntries={[]} onCreateEntry={() => {}} onNavigate={() => {}} />;
}
