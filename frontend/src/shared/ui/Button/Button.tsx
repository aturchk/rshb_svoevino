import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cx } from '@/shared/lib/cx'

import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cx(styles.button, styles[variant], styles[size], block && styles.block, className)
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
