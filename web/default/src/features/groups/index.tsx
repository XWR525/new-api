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
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

import { GroupDeleteDialog } from './components/group-delete-dialog'
import { GroupMutateDialog } from './components/group-mutate-dialog'
import { GroupsTable } from './components/groups-table'
import type { ManagedGroup } from './types'

export function Groups() {
  const { t } = useTranslation()
  const [mutateOpen, setMutateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<ManagedGroup | null>(null)

  const openCreate = () => {
    setSelectedGroup(null)
    setMutateOpen(true)
  }

  const openEdit = (group: ManagedGroup) => {
    setSelectedGroup(group)
    setMutateOpen(true)
  }

  const openDelete = (group: ManagedGroup) => {
    setSelectedGroup(group)
    setDeleteOpen(true)
  }

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Group Management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button size='sm' onClick={openCreate}>
            <Plus className='mr-2 h-4 w-4' />
            {t('Create group')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <GroupsTable onEdit={openEdit} onDelete={openDelete} />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <GroupMutateDialog
        open={mutateOpen}
        onOpenChange={setMutateOpen}
        group={selectedGroup}
      />
      <GroupDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        group={selectedGroup}
      />
    </>
  )
}
