"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const calmEase = [0.22, 1, 0.36, 1] as const;

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.52, ease: calmEase },
  },
};

type MotionProps = {
  children: ReactNode;
  className?: string;
};

export function HeaderReveal({ children, className }: MotionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.header
      data-landing-motion
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.4, ease: calmEase }
      }
      className={className}
    >
      {children}
    </motion.header>
  );
}

type StaggerContainerProps = MotionProps & {
  inView?: boolean;
  stagger?: number;
  amount?: number;
  delay?: number;
};

export function StaggerContainer({
  children,
  className,
  inView = false,
  stagger = 0.1,
  amount = 0.2,
  delay = 0,
}: StaggerContainerProps) {
  const reduceMotion = useReducedMotion();
  const variants: Variants = {
    hidden: {},
    visible: {
      transition: reduceMotion
        ? { duration: 0 }
        : { delayChildren: delay, staggerChildren: stagger },
    },
  };

  return (
    <motion.div
      data-landing-motion
      initial={reduceMotion ? false : "hidden"}
      animate={inView ? undefined : "visible"}
      whileInView={inView ? "visible" : undefined}
      viewport={inView ? { once: true, amount } : undefined}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = MotionProps & {
  compact?: boolean;
};

export function StaggerItem({
  children,
  className,
  compact = false,
}: StaggerItemProps) {
  const reduceMotion = useReducedMotion();
  const variants: Variants = compact
    ? {
        hidden: { opacity: 0, y: 8 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.42, ease: calmEase },
        },
      }
    : staggerItemVariants;

  return (
    <motion.div
      data-landing-motion
      variants={reduceMotion ? undefined : variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

type RevealOnScrollProps = MotionProps & {
  amount?: number;
};

export function RevealOnScroll({
  children,
  className,
  amount = 0.2,
}: RevealOnScrollProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-landing-motion
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.5, ease: calmEase }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

type HoverLiftProps = MotionProps;

export function HoverLift({ children, className }: HoverLiftProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-landing-motion
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: calmEase }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

type MotionPressableProps = MotionProps & {
  kind?: "primary" | "secondary";
};

export function MotionPressable({
  children,
  className,
  kind = "primary",
}: MotionPressableProps) {
  const reduceMotion = useReducedMotion();
  const hover =
    kind === "primary"
      ? { scale: 1.02, filter: "brightness(1.04)" }
      : { opacity: 0.9, filter: "brightness(1.08)" };

  return (
    <motion.div
      data-landing-motion
      whileHover={reduceMotion ? undefined : hover}
      whileTap={reduceMotion ? undefined : { scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.16, ease: calmEase }}
      className={cn("inline-flex", className)}
    >
      {children}
    </motion.div>
  );
}

type ProgressLineProps = {
  className?: string;
  delay?: number;
};

export function ProgressLine({ className, delay = 0 }: ProgressLineProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-landing-motion
      initial={reduceMotion ? false : { scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { delay, duration: 0.42, ease: calmEase }
      }
      style={{ transformOrigin: "left" }}
      className={className}
    />
  );
}

export function ProofCardReveal({ children, className }: MotionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-landing-motion
      initial={
        reduceMotion
          ? false
          : {
              opacity: 0,
              y: 16,
              borderColor: "rgba(35, 213, 245, 0.08)",
              boxShadow: "0 0 0 rgba(35, 213, 245, 0)",
            }
      }
      whileInView={{
        opacity: 1,
        y: 0,
        borderColor: "rgba(35, 213, 245, 0.24)",
        boxShadow: "0 0 28px rgba(35, 213, 245, 0.055)",
      }}
      viewport={{ once: true, amount: 0.2 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.52, ease: calmEase }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}
