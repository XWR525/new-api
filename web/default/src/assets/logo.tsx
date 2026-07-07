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
import { cn } from '@/lib/utils'
import type { SVGProps } from 'react'

export function Logo({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 1868 1868"
      fill = "#827038">
      
      <path d="M927.4 497c-6.7 1.4-16.4 5.7-21.8 9.9-2.8 2.2-12.3 11.3-21.1 20.3-54.2 55.2-114.4 115.9-234 235.8-74.4 74.5-138 138.8-141.5 142.9s-7.7 10.4-9.4 14c-2.7 5.8-3.1 7.9-3.4 17.1-.5 12.5 1.5 19.7 8 29.4 2.6 3.8 40.6 42.7 101.2 103.6 159.4 160 242.2 243.4 260.7 262.5 9.5 9.9 19.8 20.4 22.9 23.4 11.4 11.2 21.3 15.5 35.5 15.5 7.8 0 19.9-2.6 21.1-4.6.3-.5-1.2-3.7-3.4-7.1-29-45.2-50.5-102.1-59.1-156.7-5.5-34.3-7.2-79.6-4.3-108 2.5-24.2 8.4-58.2 12.9-74 8.3-29.6 17.4-55.1 27.2-76.5l4.2-8.9-5-10.1c-11.6-23.6-23.6-65.1-29.5-102.5-3.9-24.5-4.7-32.9-5.3-59.5-1.5-66.7 8.6-123.8 32.8-184.5 9-22.5 26.3-55.7 39.3-75.2 1.7-2.6 1.7-2.7-.4-3.8-3.1-1.6-14.8-4-19.5-3.9-2.2.1-5.8.5-8.1.9"/><path d="M956.7 517.8c-15.5 30.5-28.3 70.5-34.3 107.2-5.5 34.2-6.1 80.4-1.3 112 8.1 54.3 29.5 107.6 61.5 153.6 8.6 12.4 24.8 32.6 30.3 37.9 2.2 2.1 4.1 4.6 4.1 5.5-.1.8-4.4 6.4-9.6 12.5-49.2 56.6-77.9 117.7-87.5 185.9-8.6 61.3-2 125.1 19.5 189.3 8.3 24.7 14.7 40.3 16.7 40.3 1.9 0 16.1-12.2 23.8-20.6 7.2-7.9 59.9-61 230.4-232.6 78.5-79 144.2-145.4 145.9-147.5 10.3-12.9 13.4-31.6 7.8-46.5-1.2-3.2-4.2-8.6-6.7-12-2.6-3.5-41.8-43.7-87.2-89.3-128-128.7-202.6-204.5-268-272.3-21.6-22.3-36.3-36.2-38.4-36.2-.3 0-3.5 5.7-7 12.8"/></svg>
  )
}
