import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes with conditional logic (clsx) and conflict resolution
 *  (tailwind-merge). The single class-composition helper for all components. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
