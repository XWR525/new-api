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
export type ManagedGroup = {
  name: string
  display_name: string
  ratio: number
  selectable: boolean
  builtin: boolean
  auto_group: boolean
  user_count: number
  channel_count: number
  token_count: number
  model_count: number
  whitelist: string[]
}

export type ManagedGroupDetail = ManagedGroup & {
  models: string[]
  cross_group_ratios: Record<string, number> | null
  used_by_group_ratios: Record<string, number> | null
  special_usable_groups: Record<string, string> | null
}

export type ManagedGroupsResponse = {
  success: boolean
  message?: string
  data: ManagedGroup[]
}

export type ManagedGroupDetailResponse = {
  success: boolean
  message?: string
  data: ManagedGroupDetail
}

export type GroupMutationResponse = {
  success: boolean
  message?: string
  data?: {
    user_count: number
    channel_count: number
    token_count: number
  } | null
}

// 分组倍率恒为 1（后端读取层固定，且不向客户端暴露原始配置），因此创建/更新
// 均不携带倍率与"可选分组"字段。
export type CreateManagedGroupPayload = {
  name: string
  display_name?: string
}

export type UpdateManagedGroupPayload = {
  display_name?: string
}

export type AddGroupUsersPayload = {
  user_ids: number[]
  sync_tokens: boolean
}

export type RemoveGroupUsersPayload = {
  user_ids: number[]
  target_group: string
  sync_tokens: boolean
}

export type GroupChannelsPayload = {
  channel_ids: number[]
}

export type GroupAffectedResponse = {
  success: boolean
  message?: string
  data?: {
    affected: number
  } | null
}
