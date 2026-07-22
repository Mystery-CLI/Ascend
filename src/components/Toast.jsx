import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CircleAlert, Sparkles, Compass } from "lucide-react";
import { onNotify } from "@/lib/toast";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 4000;

/**
 * The one place notify() renders. Same card language as the rest of Ascend
 * (rounded, bordered, blurred), stacked from the top, tapped away or timed
 * out, instead of the browser's own "site says" dialog.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return onNotify((toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const success = t.tone === "success";
          const info = t.tone === "info";
          const Icon = success ? Sparkles : info ? Compass : CircleAlert;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{
                y: { type: "spring", stiffness: 320, damping: 26 },
                scale: { type: "spring", stiffness: 320, damping: 26 },
                opacity: { duration: 0.15 },
              }}
              onClick={() => dismiss(t.id)}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm cursor-pointer items-start gap-2.5 rounded-2xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md",
                success ? "border-primary/40" : info ? "border-sky-500/40" : "border-destructive/40"
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  success ? "text-primary" : info ? "text-sky-400" : "text-destructive"
                )}
              />
              <p className="text-[13px] leading-snug text-foreground/90">{t.message}</p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
