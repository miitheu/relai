import { useQuery } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Upload } from 'lucide-react';

export default function ImportsTab() {
  const db = useDb();
  const { data: batches, isLoading } = useQuery({
    queryKey: ['admin-import-batches'],
    queryFn: async () => {
      const { data, error } = await db.query('contact_import_batches', { order: [{ column: 'created_at', ascending: false }], limit: 50 });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: unresolvedCount } = useQuery({
    queryKey: ['admin-unresolved-staging'],
    queryFn: async () => {
      const { count, error } = await db.query('contact_import_staging', { select: 'id', count: 'exact', head: true, filters: [{ column: 'resolution_status', operator: 'eq', value: 'pending' }] });
      if (error) throw new Error(error.message);
      return count || 0;
    },
  });

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    processing: 'secondary',
    pending: 'outline',
    failed: 'destructive',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Import History</h3>
          <p className="text-xs text-muted-foreground mt-1">Review contact import batches and their status.</p>
        </div>
        {unresolvedCount !== undefined && unresolvedCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {unresolvedCount} unresolved rows
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading imports...</div>
      ) : !batches?.length ? (
        <div className="text-center py-12">
          <Upload size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No imports yet</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Imported</TableHead>
                <TableHead className="text-right">Skipped</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium text-sm">{b.name || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{b.file_name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[b.status] || 'outline'} className="text-xs capitalize">
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{b.total_rows ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{b.imported_rows ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{b.skipped_rows ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(b.created_at), 'MMM d, yyyy')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
