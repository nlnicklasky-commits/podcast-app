function makeIcon(path, viewBox = '0 0 24 24') {
  const Icon = ({ size = 18, strokeWidth = 1.5, style = {}, className = '', ...rest }) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
      {...rest}
    >
      {path}
    </svg>
  )
  return Icon
}

export const Search = makeIcon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>)
export const Plus = makeIcon(<><path d="M12 5v14M5 12h14" /></>)
export const Library = makeIcon(<><path d="M3 5h4v14H3zM10 5h4v14h-4zM17 7l3 1-4 13-3-1z" /></>)
export const Brain = makeIcon(<><path d="M9 4a3 3 0 0 0-3 3v0a3 3 0 0 0-3 3v2a3 3 0 0 0 2 2.83V16a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2V5a1 1 0 0 0-1-1H9zM15 4a3 3 0 0 1 3 3v0a3 3 0 0 1 3 3v2a3 3 0 0 1-2 2.83V16a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h1z" /></>)
export const Sparkle = makeIcon(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></>)
export const Chat = makeIcon(<><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" /></>)
export const Headphones = makeIcon(<><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z" /></>)
export const Play = makeIcon(<><path d="M7 5l12 7-12 7z" fill="currentColor" /></>)
export const Pause = makeIcon(<><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none" /></>)
export const Bookmark = makeIcon(<><path d="M6 4h12v17l-6-4-6 4z" /></>)
export const Quote = makeIcon(<><path d="M5 10c0-2 1-4 4-4M5 10v4c0 2 2 2 2 2H5M14 10c0-2 1-4 4-4M14 10v4c0 2 2 2 2 2h-2" /></>)
export const Hash = makeIcon(<><path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16" /></>)
export const Arrow = makeIcon(<><path d="M5 12h14M13 6l6 6-6 6" /></>)
export const Back = makeIcon(<><path d="M19 12H5M11 6l-6 6 6 6" /></>)
export const X = makeIcon(<><path d="M6 6l12 12M18 6L6 18" /></>)
export const Filter = makeIcon(<><path d="M3 6h18M6 12h12M10 18h4" /></>)
export const Wave = makeIcon(<><path d="M3 12h2l2-6 3 12 3-9 3 6 2-3h3" /></>)
export const Send = makeIcon(<><path d="M4 12l16-8-6 17-3-7-7-2z" /></>)
export const Settings = makeIcon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V22a2 2 0 1 1-4 0v-.1a2 2 0 0 0-1.2-1.8 2 2 0 0 0-2.2.4l-.1.1A2 2 0 1 1 3.3 17.8l.1-.1a2 2 0 0 0 .4-2.2 2 2 0 0 0-1.8-1.2H2a2 2 0 1 1 0-4h.1a2 2 0 0 0 1.8-1.2 2 2 0 0 0-.4-2.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a2 2 0 0 0 2.2.4H9a2 2 0 0 0 1.2-1.8V2a2 2 0 1 1 4 0v.1a2 2 0 0 0 1.2 1.8 2 2 0 0 0 2.2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a2 2 0 0 0-.4 2.2V9a2 2 0 0 0 1.8 1.2H22a2 2 0 1 1 0 4h-.1a2 2 0 0 0-1.8 1.2z" /></>)
export const Check = makeIcon(<><path d="M5 12l4.5 4.5L19 7" /></>)
export const Clock = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)
export const More = makeIcon(<><circle cx="6" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /></>)
export const Spark = makeIcon(<><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" /></>)
export const Globe = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>)
export const FileText = makeIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>)
export const Mic = makeIcon(<><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" /></>)
export const Download = makeIcon(<><path d="M12 5v10M7 12l5 5 5-5" /><path d="M5 19h14" /></>)
export const Compass = makeIcon(<><circle cx="12" cy="12" r="9" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>)
