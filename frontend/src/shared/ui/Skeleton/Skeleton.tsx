import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: string
  height?: string
  radius?: string
}

export function Skeleton({ width = '100%', height = '16px', radius }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={styles.skeleton}
      style={{ display: 'block', width, height, borderRadius: radius }}
    />
  )
}
