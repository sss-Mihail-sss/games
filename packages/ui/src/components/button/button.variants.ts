import { tv, type VariantProps } from "tailwind-variants";

/** Made for the game UI first: menus and settings over a dark, blurred scene. */
export const button = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
    "transition-colors select-none",
    "outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ],
  variants: {
    variant: {
      solid: "",
      subtle: "",
      outline: "border",
    },
    tone: {
      primary: "",
      neutral: "",
    },
    size: {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4",
      lg: "h-12 px-6 text-lg",
    },
  },
  compoundVariants: [
    {
      variant: "solid",
      tone: "primary",
      class: "bg-amber-400 text-neutral-950 enabled:hover:bg-amber-300",
    },
    {
      variant: "solid",
      tone: "neutral",
      class: "bg-white/10 text-white enabled:hover:bg-white/20",
    },
    {
      variant: "subtle",
      tone: "primary",
      class: "text-amber-300 enabled:hover:bg-amber-300/10",
    },
    {
      variant: "subtle",
      tone: "neutral",
      class: "text-white/80 enabled:hover:bg-white/10 enabled:hover:text-white",
    },
    {
      variant: "outline",
      tone: "primary",
      class: "border-amber-300/60 text-amber-200 enabled:hover:bg-amber-300/10",
    },
    {
      variant: "outline",
      tone: "neutral",
      class: "border-white/25 text-white enabled:hover:bg-white/10",
    },
  ],
  defaultVariants: {
    variant: "solid",
    tone: "neutral",
    size: "md",
  },
});

export type ButtonVariants = VariantProps<typeof button>;
