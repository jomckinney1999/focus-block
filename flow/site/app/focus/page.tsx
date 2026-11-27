import type { Metadata } from "next";
import { FocusRoom } from "@/components/focus-room";

export const metadata: Metadata = {
  title: "Focus room · Undercurrent",
  description: "A Pomodoro timer with living scenes and focus music that softens on your breaks.",
};

export default function FocusPage() {
  return <FocusRoom />;
}
