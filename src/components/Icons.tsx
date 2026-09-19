/** A small hand-set icon family: 1.6px strokes, round caps, 24px box. */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 22, children, ...props }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...props}
    >
      {children}
    </svg>
  )
}

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 9.8 3.7h4.4a1 1 0 0 1 .83.45l.94 1.4A1 1 0 0 0 16.8 6h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" />
    <circle cx="12" cy="13" r="3.6" />
  </Icon>
)

export const BarcodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H6M18 4h1.5A1.5 1.5 0 0 1 21 5.5V7M21 17v1.5a1.5 1.5 0 0 1-1.5 1.5H18M6 20H4.5A1.5 1.5 0 0 1 3 18.5V17" />
    <path d="M7 8v8M10 8v8M13.5 8v8M17 8v8" />
  </Icon>
)

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19.2 8.8a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M14.5 5.5 18.5 9.5" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="m4.5 12.5 5 5 10-11" /></Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="m6 6 12 12M18 6 6 18" /></Icon>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}><path d="m14.5 5-7 7 7 7" /></Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="m9.5 5 7 7-7 7" /></Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}><path d="m5 9 7 7 7-7" /></Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
    <path d="M10.5 10v6.5M13.5 10v6.5" />
  </Icon>
)

export const ScaleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5v4M8 5.5h8" />
    <path d="M6 8.5h12a1 1 0 0 1 .98 1.2l-1.6 8A1 1 0 0 1 16.4 18.5H7.6a1 1 0 0 1-.98-.8l-1.6-8A1 1 0 0 1 6 8.5Z" />
    <path d="M9.5 12.5h5" />
  </Icon>
)

export const PersonIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" />
  </Icon>
)

export const LedgerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 1 5 17Z" />
    <path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H19" />
    <path d="M9 8.5h6M9 11.5h4" />
  </Icon>
)

export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.3l-1.8-5.7L4.5 10.8 10.2 9Z" />
    <path d="M18.5 3.5v3M20 5h-3" />
  </Icon>
)

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5M12 16h.01" />
  </Icon>
)

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 8h.01" />
  </Icon>
)

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="9.5" r="1.6" />
    <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17M14.5 15l1.7-1.7a2 2 0 0 1 2.8 0l1.5 1.5" />
  </Icon>
)

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 4v4h-4" />
  </Icon>
)

export const ChevronUpDownIcon = (p: IconProps) => (
  <Icon {...p}><path d="m8 10 4-4 4 4M8 14l4 4 4-4" /></Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Icon>
)

export const SparkleIcon = SparkIcon

export const FlameIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.6 2.5c.3 2.6 1.7 3.8 3 5.2A7.3 7.3 0 0 1 17.6 13a5.6 5.6 0 0 1-11.2 0c0-1.9.8-3.5 1.8-4.7.2 1.2.8 2 1.7 2.4-.5-3.4.6-6.3 2.7-8.2Z" />
  </Icon>
)

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19.5V5M4 19.5h16" />
    <path d="m7.5 15 3.5-4 3 2.4 4.5-6" />
  </Icon>
)

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
)

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
  </Icon>
)

export const DeviceIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M9 20.5h6" />
  </Icon>
)

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 5.5 6v5.6c0 4 2.7 7.4 6.5 8.9 3.8-1.5 6.5-4.9 6.5-8.9V6Z" />
    <path d="m9.3 12.2 1.9 1.9 3.6-3.9" />
  </Icon>
)

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 4.5h3A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2h-3" />
    <path d="M10 8.5 6 12l4 3.5M6 12h9" />
  </Icon>
)

/**
 * Google's own mark, in Google's own colours — the one glyph here that is not
 * part of the stroke family above, because brand marks are drawn as given.
 */
export const GoogleMark = ({ size = 18, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false" {...props}>
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
  </svg>
)
