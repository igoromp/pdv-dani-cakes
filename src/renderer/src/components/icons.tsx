import { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props
})

export function CartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <path d="M2.5 3h2l2.2 12.1a2 2 0 0 0 2 1.65h8.16a2 2 0 0 0 1.97-1.63l1.34-7.12H6.2" />
    </svg>
  )
}

export function PackageIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 7.5 12 3l8.5 4.5V16.5L12 21l-8.5-4.5Z" />
      <path d="M3.9 7.3 12 11.7l8.1-4.4" />
      <path d="M12 11.7V21" />
    </svg>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M2.5 20.5h19" />
    </svg>
  )
}

export function ClipboardListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
    </svg>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    </svg>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h6.5" />
      <path d="M10.5 12H21" />
      <path d="M17.5 8.5 21 12l-3.5 3.5" />
    </svg>
  )
}

export function CakeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 21v-7.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V21" />
      <path d="M2.5 21h19" />
      <path d="M6 11.5V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2.5" />
      <path d="M12 7V4" />
      <path d="M12 4c-.9 0-1.4-.9-.9-1.6L12 1l.9 1.4c.5.7 0 1.6-.9 1.6Z" />
      <path d="M8.5 15.5c.6.7 1.4.7 2 0s1.4-.7 2 0 1.4.7 2 0" />
    </svg>
  )
}

export function BanknoteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M6 9v.01M18 15v.01" />
    </svg>
  )
}

export function CreditCardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 15h4" />
    </svg>
  )
}

export function SmartphoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.2" />
      <path d="M11 18.5h2" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 20.5l1.3-4.4A8 8 0 1 1 8 19.3l-4.5 1.2Z" />
      <path d="M9 9.2c.3 1.4 1.1 2.6 2.2 3.5.6.5 1.3.9 2 1.1l.9-1.1 1.9.8c-.2.9-1 1.5-1.9 1.5a6 6 0 0 1-5.6-5.6c0-.9.6-1.7 1.5-1.9l.8 1.9-.8.9Z" />
    </svg>
  )
}

export function DashboardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="1.6" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.6" />
      <rect x="13" y="10" width="7.5" height="10.5" rx="1.6" />
    </svg>
  )
}

export function CalendarPlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
      <path d="M12 12.5v5M9.5 15h5" />
    </svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 16.8v.01" />
    </svg>
  )
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11.8a2 2 0 0 1 2 2v1" />
      <rect x="3.5" y="7.5" width="17" height="11.5" rx="2" />
      <path d="M20.5 11.5h-3.6a2 2 0 0 0 0 4h3.6" />
    </svg>
  )
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 16.5 9 11l3.5 3.5L20 7" />
      <path d="M15 7h5v5" />
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 5 8 12l6.5 7" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 5 16 12l-6.5 7" />
    </svg>
  )
}
