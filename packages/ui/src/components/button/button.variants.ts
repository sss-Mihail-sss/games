import { tv, type VariantProps } from "tailwind-variants";

export const button = tv({
  base: "",
  variants: {
    variant: {
      solid: "",
      subtle: "",
      outline: "",
    },
    tone: {
      primary: "",
      neutral: "",
    },
    size: {
      sm: "",
      md: "",
      lg: "",
    },
  },
  defaultVariants: {
    variant: "solid",
    tone: "neutral",
    size: "md",
  },
});

export type ButtonVariants = VariantProps<typeof button>;
