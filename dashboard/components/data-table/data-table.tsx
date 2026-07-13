'use client';

import { useState, type ReactNode, Fragment } from 'react';
import { Columns3 } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
} from '@tanstack/react-table';

import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import { EmptyState } from '@/components/states/empty-state';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { surface } from '@/lib/semantic-colors';
import { cn } from '@/lib/utils';

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Column id used for the global text filter. */
  filterColumn?: string;
  filterPlaceholder?: string;
  pageSize?: number;
  /** Row click opens L1 DetailSheet — preserves list scroll via controlled sheet state in parent. */
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData, index: number) => string;
  /**
   * When set, the row whose id matches gets `data-state="active"` and warning highlight
   * (pending review identity — RTC-F03 / RTC-F08).
   */
  activeRowId?: string;
  /** Initial sort state; default `[]` (callers set per RTC-F11). */
  initialSorting?: SortingState;
  /**
   * Renders in the toolbar band above the table. Default text filter remains unless
   * `showFilter={false}`; place facet filters here beside the search input.
   */
  toolbar?: ReactNode;
  /**
   * Column visibility — controlled when `onColumnVisibilityChange` is set;
   * otherwise seeds uncontrolled state (default `{}`).
   */
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** When true, shows the shared Columns dropdown (shadcn pattern). Default false. */
  showColumnVisibility?: boolean;
  /**
   * When set and returns non-null, renders an extra full-width row beneath the data row
   * (e.g. inline rejection detail on Signals ingestion log).
   */
  renderSubRow?: (row: TData) => ReactNode | null;
  emptyMessage?: string;
  showPagination?: boolean;
  showFilter?: boolean;
  /** Controlled column/global filter — when set, bypasses internal filter state. */
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  className?: string;
};

function DataTableViewOptions<TData>({ table }: { table: TanstackTable<TData> }) {
  const hideableColumns = table.getAllColumns().filter((column) => column.getCanHide());

  if (hideableColumns.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="ml-auto gap-1.5" />}
      >
        <Columns3 data-icon="inline-start" aria-hidden="true" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          {hideableColumns.map((column) => {
            const meta = column.columnDef.meta as { label?: string } | undefined;
            const label =
              meta?.label ??
              (typeof column.columnDef.header === 'string'
                ? column.columnDef.header
                : column.id);

            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataTable<TData>({
  columns,
  data,
  filterColumn,
  filterPlaceholder = 'Filter…',
  pageSize = 10,
  onRowClick,
  getRowId,
  activeRowId,
  initialSorting = [],
  toolbar,
  columnVisibility: columnVisibilityProp,
  onColumnVisibilityChange,
  showColumnVisibility = false,
  renderSubRow,
  emptyMessage = 'No results.',
  showPagination = true,
  showFilter = true,
  filterValue: controlledFilterValue,
  onFilterChange,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [uncontrolledVisibility, setUncontrolledVisibility] = useState<VisibilityState>(
    () => columnVisibilityProp ?? {}
  );
  const isControlledFilter = controlledFilterValue !== undefined && onFilterChange != null;
  const isControlledVisibility = onColumnVisibilityChange != null;
  const columnVisibility = isControlledVisibility
    ? (columnVisibilityProp ?? {})
    : uncontrolledVisibility;

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter: filterColumn ? undefined : globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: isControlledVisibility
      ? onColumnVisibilityChange
      : setUncontrolledVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
    globalFilterFn: 'includesString',
  });

  const filterValue = isControlledFilter
    ? controlledFilterValue
    : filterColumn
      ? ((table.getColumn(filterColumn)?.getFilterValue() as string) ?? '')
      : globalFilter;

  function handleFilterChange(value: string) {
    if (isControlledFilter) {
      onFilterChange(value);
      return;
    }
    if (filterColumn) {
      table.getColumn(filterColumn)?.setFilterValue(value);
      return;
    }
    setGlobalFilter(value);
  }

  const rows = table.getRowModel().rows;
  const isInteractive = Boolean(onRowClick);
  const showToolbarBand = showFilter || toolbar != null || showColumnVisibility;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {showToolbarBand ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {showFilter ? (
            <Input
              value={filterValue}
              onChange={(event) => handleFilterChange(event.target.value)}
              placeholder={filterPlaceholder}
              className="max-w-sm"
              aria-label={filterPlaceholder}
            />
          ) : null}
          {toolbar}
          {showColumnVisibility ? <DataTableViewOptions table={table} /> : null}
        </div>
      ) : null}

      <div className="border-border rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => {
                const isActive = activeRowId != null && row.id === activeRowId;
                const dataState = isActive
                  ? 'active'
                  : row.getIsSelected()
                    ? 'selected'
                    : undefined;

                const subRow = renderSubRow?.(row.original) ?? null;

                return (
                  <Fragment key={row.id}>
                    <TableRow
                      data-state={dataState}
                      tabIndex={isInteractive ? 0 : undefined}
                      className={cn(
                        isInteractive && 'cursor-pointer',
                        isActive && cn(surface.warningMutedBg, 'ring-1', surface.warningRing),
                      )}
                      onClick={
                        isInteractive
                          ? () => onRowClick?.(row.original)
                          : undefined
                      }
                      onKeyDown={
                        isInteractive
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onRowClick?.(row.original);
                              }
                            }
                          : undefined
                      }
                      role={isInteractive ? 'button' : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {subRow != null ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={row.getVisibleCells().length}
                          className="p-0"
                        >
                          {subRow}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyState message={emptyMessage} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && rows.length > 0 ? (
        <DataTablePagination table={table} />
      ) : null}
    </div>
  );
}
