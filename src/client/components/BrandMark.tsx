export function KarmaForgeMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="kf-brand-svg"
    >
      <rect
        x="1.5"
        y="1.5"
        width="33"
        height="33"
        rx="8"
        fill="#191918"
        stroke="#2D2C2A"
        strokeWidth="1.5"
      />
      <path d="M18 6.5L27 16H21.4V21H14.6V16H9L18 6.5Z" fill="#FF4500" />
      <path d="M8.5 23.5H27.5L24.8 28.5H11.2L8.5 23.5Z" fill="#EFECE6" />
      <rect x="16.5" y="13.5" width="3" height="3" fill="#101010" />
      <rect x="26" y="7" width="3" height="3" fill="#36C96E" />
    </svg>
  );
}

export function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8.5 1.5C8.5 1.5 12.2 4.6 12.2 8.2C12.2 10.9 10.3 13.5 7.9 13.5C5.4 13.5 3.8 11.6 3.8 9.2C3.8 7.5 4.8 6 5.6 5.1C5.6 6.4 6.3 7.2 6.9 7.2C6.8 5.2 7.4 3.2 8.5 1.5Z"
        fill="#FF4500"
      />
    </svg>
  );
}

export function BoltIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.2 1.5L3.5 9H7.8L6.8 14.5L12.5 7H8.2L9.2 1.5Z"
        fill="#F5B731"
      />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.8V8.2L10.4 9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 2.5H11.5V6.2C11.5 8.1 10 9.7 8 9.7C6 9.7 4.5 8.1 4.5 6.2V2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M4.5 4H2.5V5.5C2.5 6.6 3.4 7.5 4.5 7.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M11.5 4H13.5V5.5C13.5 6.6 12.6 7.5 11.5 7.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 9.7V13M5.5 13H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.2" y="3" width="11.6" height="10.8" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.2 6.3H13.8M5.5 1.8V4.2M10.5 1.8V4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 6.2H5.6L9 3.4V12.6L5.6 9.8H3V6.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M11.2 6L14 10M14 6L11.2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        <path d="M11.3 5.5C12.2 6.4 12.2 9.6 11.3 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function TerminalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.6 6.2L6.8 8L4.6 9.8M8 9.8H11.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AnvilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 5.2H14L12.2 8.4H5.2L2 5.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.5 8.4L4.2 12.5H11.8L10.5 8.4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function UpvoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.2L14 9H10.4V13.8H5.6V9H2L8 2.2Z" fill="currentColor" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.8 4L2.5 7.2L5.8 10.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 7.2H9.6C11.8 7.2 13.5 8.8 13.5 10.8C13.5 11.7 13.1 12.5 12.5 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ClueIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.2C5.5 2.2 3.8 4 3.8 6.2C3.8 7.7 4.6 8.9 5.7 9.7V11.2H10.3V9.7C11.4 8.9 12.2 7.7 12.2 6.2C12.2 4 10.5 2.2 8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.2 13.4H9.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function DragHandleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="4.2" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="4.2" r="1.2" fill="currentColor" />
      <circle cx="5.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="5.5" cy="11.8" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="11.8" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.2 2.8L13.2 8L4.2 13.2V2.8Z" fill="currentColor" />
    </svg>
  );
}
