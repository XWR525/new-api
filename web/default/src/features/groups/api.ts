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
import { api, type ApiRequestConfig } from '@/lib/api'

import type {
  AddGroupUsersPayload,
  CreateManagedGroupPayload,
  GroupAffectedResponse,
  GroupChannelsPayload,
  GroupMutationResponse,
  ManagedGroupDetailResponse,
  ManagedGroupsResponse,
  RemoveGroupUsersPayload,
  UpdateManagedGroupPayload,
} from './types'

// 分组写操作由调用方自行判断 success 并提示服务端消息（如"分组仍被引用：…"），
// 因此统一跳过拦截器的全局提示，避免同一次失败弹出两条重复 toast。
const groupMutationConfig = (
  config: ApiRequestConfig = {}
): ApiRequestConfig => ({
  ...config,
  skipBusinessError: true,
  skipErrorHandler: true,
})

export async function getManagedGroups(): Promise<ManagedGroupsResponse> {
  const res = await api.get<ManagedGroupsResponse>('/api/group/manage')
  return res.data
}

export async function getManagedGroupDetail(
  name: string
): Promise<ManagedGroupDetailResponse> {
  const res = await api.get<ManagedGroupDetailResponse>(
    `/api/group/manage/${encodeURIComponent(name)}`
  )
  return res.data
}

export async function createManagedGroup(
  payload: CreateManagedGroupPayload
): Promise<GroupMutationResponse> {
  const res = await api.post<GroupMutationResponse>(
    '/api/group/manage',
    payload,
    groupMutationConfig()
  )
  return res.data
}

export async function updateManagedGroup(
  name: string,
  payload: UpdateManagedGroupPayload
): Promise<GroupMutationResponse> {
  const res = await api.put<GroupMutationResponse>(
    `/api/group/manage/${encodeURIComponent(name)}`,
    payload,
    groupMutationConfig()
  )
  return res.data
}

export async function deleteManagedGroup(
  name: string
): Promise<GroupMutationResponse> {
  const res = await api.delete<GroupMutationResponse>(
    `/api/group/manage/${encodeURIComponent(name)}`,
    groupMutationConfig()
  )
  return res.data
}

export async function updateManagedGroupWhitelist(
  name: string,
  models: string[]
): Promise<GroupMutationResponse> {
  const res = await api.put<GroupMutationResponse>(
    `/api/group/manage/${encodeURIComponent(name)}/models`,
    { models },
    groupMutationConfig()
  )
  return res.data
}

export async function addManagedGroupUsers(
  name: string,
  payload: AddGroupUsersPayload
): Promise<GroupAffectedResponse> {
  const res = await api.post<GroupAffectedResponse>(
    `/api/group/manage/${encodeURIComponent(name)}/users`,
    payload,
    groupMutationConfig()
  )
  return res.data
}

export async function removeManagedGroupUsers(
  name: string,
  payload: RemoveGroupUsersPayload
): Promise<GroupAffectedResponse> {
  const res = await api.post<GroupAffectedResponse>(
    `/api/group/manage/${encodeURIComponent(name)}/users/remove`,
    payload,
    groupMutationConfig()
  )
  return res.data
}

export async function addManagedGroupChannels(
  name: string,
  payload: GroupChannelsPayload
): Promise<GroupAffectedResponse> {
  const res = await api.post<GroupAffectedResponse>(
    `/api/group/manage/${encodeURIComponent(name)}/channels`,
    payload,
    groupMutationConfig()
  )
  return res.data
}

export async function removeManagedGroupChannels(
  name: string,
  payload: GroupChannelsPayload
): Promise<GroupAffectedResponse> {
  const res = await api.post<GroupAffectedResponse>(
    `/api/group/manage/${encodeURIComponent(name)}/channels/remove`,
    payload,
    groupMutationConfig()
  )
  return res.data
}
