import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/** lista com indicador Aurora que desliza até a aba ativa */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = React.useState<{ x: number; w: number } | null>(null);

  React.useEffect(() => {
    const list = innerRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) {
        setRect(null);
        return;
      }
      setRect({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [children]);

  return (
    <TabsPrimitive.List
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn(
        "relative inline-flex h-9 items-center justify-center rounded-xl border border-border/60 bg-muted/60 p-1 text-muted-foreground backdrop-blur",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="aurora-slider pointer-events-none absolute bottom-1 h-[2px] rounded-full aurora-rail"
        style={{
          transform: `translateX(${rect?.x ?? 0}px)`,
          width: rect?.w ?? 0,
          opacity: rect ? 1 : 0,
        }}
      />
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-surface-2 data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-glow)]",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
