interface Props {
  width?: number | string
  height?: number | string
}

export function Skeleton({ width = '100%', height = 20 }: Props) {
  return (
    <span
      className="skeleton"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}
