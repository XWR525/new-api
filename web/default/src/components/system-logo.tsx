/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Logo } from '@/assets/logo'
import { DEFAULT_LOGO } from '@/lib/constants'
import { cn } from '@/lib/utils'

type SystemLogoProps = {
  src: string
  alt?: string
  loading?: boolean
  logoLoaded?: boolean
  className?: string
}

/**
 * System logo component with automatic fallback to the built-in Logo SVG
 * when no custom logo has been configured (src === DEFAULT_LOGO).
 */
export function SystemLogo({
  src,
  alt = 'Logo',
  loading,
  logoLoaded,
  className,
}: SystemLogoProps) {
  const isLoading = loading && !logoLoaded

  // Use built-in Logo component when no custom logo is configured
  if (src === DEFAULT_LOGO || !src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center',
          isLoading && 'animate-pulse rounded-full bg-muted',
          className
        )}
      >
        <Logo className='size-full' />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        'rounded-full object-cover transition-opacity duration-200',
        isLoading ? 'opacity-0' : 'opacity-100',
        className
      )}
    />
  )
}
