import { Button as SdkButton } from "@ui-sdk/react/button";
import type { ComponentProps } from "react";

import { button, type ButtonVariants } from "./button.variants.ts";

interface ButtonProps
  extends ComponentProps<typeof SdkButton>, ButtonVariants {}

export function Button({
  className,
  variant,
  size,
  tone,
  ...props
}: ButtonProps) {
  return <SdkButton className={button({ variant, size, tone })} {...props} />;
}
