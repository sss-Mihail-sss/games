import { Button as SdkButton } from "@ui-sdk/react/button";
import type { ComponentProps } from "react";

import { button, type ButtonVariants } from "./button.variants.ts";

interface ButtonProps
  extends Omit<ComponentProps<typeof SdkButton>, "className">, ButtonVariants {
  /** Extra classes, merged with the variant's (tailwind-variants resolves clashes). */
  className?: string;
}

export function Button({
  className,
  variant,
  size,
  tone,
  ...props
}: ButtonProps) {
  return (
    <SdkButton
      className={button({ variant, size, tone, class: className })}
      {...props}
    />
  );
}
