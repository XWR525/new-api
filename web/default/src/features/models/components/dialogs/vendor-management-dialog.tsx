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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Plus, RefreshCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import { ProviderBadge } from '@/components/provider-badge'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import { getVendors } from '../../api'
import { handleDeleteVendor } from '../../lib/vendor-actions'
import { vendorsQueryKeys } from '../../lib'
import type { Vendor } from '../../types'
import { VendorMutateDialog } from './vendor-mutate-dialog'

type VendorManagementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VendorManagementDialog({
  open,
  onOpenChange,
}: VendorManagementDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mutateOpen, setMutateOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: vendorsQueryKeys.list(),
    queryFn: () => getVendors(),
    enabled: open,
  })

  const vendors = useMemo(() => data?.data?.items ?? [], [data?.data?.items])

  useEffect(() => {
    if (!open) {
      setMutateOpen(false)
      setEditingVendor(null)
      setDeleteVendor(null)
    }
  }, [open])

  const handleCreateClick = () => {
    setEditingVendor(null)
    setMutateOpen(true)
  }

  const handleEditClick = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setMutateOpen(true)
  }

  const handleMutateOpenChange = (next: boolean) => {
    setMutateOpen(next)
    if (!next) {
      setEditingVendor(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteVendor) return
    setIsDeleting(true)
    try {
      await handleDeleteVendor(deleteVendor.id, queryClient, () =>
        setDeleteVendor(null)
      )
    } finally {
      setIsDeleting(false)
    }
  }

  let vendorsContent
  if (isLoading) {
    vendorsContent = (
      <div className='flex flex-col items-center justify-center gap-2 py-12 text-center'>
        <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
        <p className='text-muted-foreground text-sm'>
          {t('Fetching vendors...')}
        </p>
      </div>
    )
  } else if (vendors.length === 0) {
    vendorsContent = (
      <Empty className='border border-dashed py-10'>
        <EmptyMedia variant='icon'>
          <Building2 className='h-6 w-6' />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('No vendors yet')}</EmptyTitle>
          <EmptyDescription>
            {t('Create your first vendor to group models by provider.')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  } else {
    vendorsContent = (
      <StaticDataTable
        tableClassName='min-w-[560px]'
        data={vendors}
        getRowKey={(vendor) => vendor.id}
        columns={[
          {
            id: 'vendor',
            header: t('Vendor'),
            cellClassName: 'align-top whitespace-normal',
            cell: (vendor) => (
              <div className='flex flex-col gap-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <ProviderBadge
                    iconKey={vendor.icon || null}
                    label={vendor.name}
                  />
                  <TableId value={vendor.id} />
                </div>
                {vendor.description ? (
                  <p className='text-muted-foreground text-xs'>
                    {vendor.description}
                  </p>
                ) : (
                  <p className='text-muted-foreground text-xs italic'>
                    {t('No description provided')}
                  </p>
                )}
              </div>
            ),
          },
          {
            id: 'status',
            header: t('Status'),
            cellClassName: 'align-top',
            cell: (vendor) => (
              <StatusBadge
                label={vendor.status === 1 ? t('Enabled') : t('Disabled')}
                variant={vendor.status === 1 ? 'success' : 'danger'}
                size='sm'
                copyable={false}
              />
            ),
          },
          {
            id: 'actions',
            header: t('Actions'),
            className: 'text-right',
            cellClassName: 'align-top',
            cell: (vendor) => (
              <StaticRowActions
                editLabel={t('Edit vendor')}
                deleteLabel={t('Delete vendor')}
                menuLabel={t('Open menu')}
                onEdit={() => handleEditClick(vendor)}
                onDelete={() => setDeleteVendor(vendor)}
              />
            ),
          },
        ]}
      />
    )
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          <>
            <Building2 className='text-foreground/80 h-5 w-5' />
            {t('Manage Vendors')}
          </>
        }
        description={t(
          'Create, edit, or remove model vendors shown across the console.'
        )}
        titleClassName='flex flex-wrap items-center gap-2 text-lg'
        descriptionClassName='text-sm leading-relaxed'
        contentHeight='auto'
        bodyClassName='space-y-3'
      >
        <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-md border p-2 text-sm'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button size='sm' onClick={handleCreateClick}>
              <Plus className='mr-2 h-4 w-4' />
              {t('New Vendor')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <RefreshCcw className='mr-2 h-4 w-4' />
              )}
              {t('Refresh')}
            </Button>
          </div>
          <StatusBadge
            label={t('{{count}} vendors', { count: vendors.length })}
            variant='neutral'
            copyable={false}
          />
        </div>

        <div className='flex flex-col gap-3'>
          {error && (
            <Alert variant='destructive'>
              <AlertTitle>{t('Unable to load vendors')}</AlertTitle>
              <AlertDescription>
                {(error as Error).message ||
                  t('Please retry or refresh the page.')}
              </AlertDescription>
            </Alert>
          )}

          {vendorsContent}
        </div>
      </Dialog>

      <VendorMutateDialog
        open={mutateOpen}
        onOpenChange={handleMutateOpenChange}
        currentVendor={editingVendor}
      />

      <ConfirmDialog
        open={Boolean(deleteVendor)}
        onOpenChange={(next) => {
          if (!next) setDeleteVendor(null)
        }}
        title={t('Delete vendor')}
        desc={
          <p>
            {t(
              'Are you sure you want to delete vendor "{{name}}"? This action cannot be undone.',
              { name: deleteVendor?.name ?? '' }
            )}
          </p>
        }
        destructive
        confirmText={isDeleting ? t('Deleting...') : t('Delete')}
        isLoading={isDeleting}
        handleConfirm={handleDeleteConfirm}
      />
    </>
  )
}
