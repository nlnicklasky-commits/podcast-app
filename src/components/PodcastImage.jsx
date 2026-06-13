import { useState } from 'react'
import * as Icons from './Icons'

export default function PodcastImage({ src, size = 40, className = '', iconSize, onClick }) {
  const [failed, setFailed] = useState(false)

  const resolvedIconSize = iconSize ?? Math.max(12, Math.round(size * 0.4))

  if (!src || failed) {
    const Wrapper = onClick ? 'button' : 'div'
    return (
      <Wrapper
        onClick={onClick}
        className={`shrink-0 grid place-items-center mute bg-[var(--bg-2)] rounded-[var(--r-sm)] ${onClick ? 'cursor-pointer' : ''} ${className}`}
        style={{ width: size, height: size }}
      >
        <Icons.Headphones size={resolvedIconSize} />
      </Wrapper>
    )
  }

  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper onClick={onClick} className={`shrink-0 ${onClick ? 'cursor-pointer' : ''}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`object-cover shrink-0 rounded-[var(--r-sm)] ${className}`}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    </Wrapper>
  )
}
