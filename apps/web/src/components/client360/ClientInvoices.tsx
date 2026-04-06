import { useState, useRef } from 'react';
import {
  Receipt, Upload, Download, Trash2, Loader2, Link2,
  CheckCircle2, Clock, AlertTriangle, DollarSign, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useInvoices,
  useUploadInvoice,
  useMarkInvoicePaid,
  useDeleteInvoice,
  useInvoiceDownloadUrl,
  type Invoice,
} from '@/hooks/useInvoices';
import { useToast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  opportunities: any[];
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrencyAmount(amount: number | null, currency: string): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function isOverdue(invoice: Invoice): boolean {
  if (invoice.status === 'paid' || invoice.status === 'void') return false;
  if (!invoice.due_date) return false;
  return new Date(invoice.due_date) < new Date();
}

function daysOverdue(invoice: Invoice): number {
  if (!invoice.due_date) return 0;
  const diff = new Date().getTime() - new Date(invoice.due_date).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  unpaid: { label: 'Unpaid', color: 'bg-warning/10 text-warning', icon: Clock },
  paid: { label: 'Paid', color: 'bg-success/10 text-success', icon: CheckCircle2 },
  overdue: { label: 'Overdue', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
  void: { label: 'Void', color: 'bg-muted text-muted-foreground', icon: Trash2 },
};

export default function ClientInvoices({ clientId, opportunities }: Props) {
  const { data: invoices = [], isLoading } = useInvoices(clientId);
  const uploadMutation = useUploadInvoice();
  const markPaidMutation = useMarkInvoicePaid();
  const deleteMutation = useDeleteInvoice();
  const getDownloadUrl = useInvoiceDownloadUrl();
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    opportunityId: '',
    invoiceNumber: '',
    amount: '',
    currency: 'USD',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    notes: '',
  });
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const closedWonOpps = opportunities.filter((o: any) => o.stage === 'Closed Won');

  const resetForm = () => {
    setFormData({
      opportunityId: '',
      invoiceNumber: '',
      amount: '',
      currency: 'USD',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      notes: '',
    });
    setPendingFile(null);
    setShowForm(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await uploadMutation.mutateAsync({
        clientId,
        opportunityId: formData.opportunityId || undefined,
        file: pendingFile || undefined,
        invoiceNumber: formData.invoiceNumber || undefined,
        amount: formData.amount ? parseFloat(formData.amount) : undefined,
        currency: formData.currency,
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate || undefined,
        notes: formData.notes || undefined,
      });
      toast({ title: 'Invoice created' });
      resetForm();
    } catch (err: any) {
      toast({ title: 'Failed to create invoice', description: err.message, variant: 'destructive' });
    }
  };

  const handleDownload = async (invoice: Invoice) => {
    if (!invoice.file_path) return;
    try {
      const url = await getDownloadUrl(invoice.file_path);
      window.open(url, '_blank');
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleMarkPaid = async (invoice: Invoice) => {
    try {
      await markPaidMutation.mutateAsync(invoice.id);
      toast({ title: 'Invoice marked as paid' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (invoice: Invoice) => {
    if (!confirm(`Delete invoice ${invoice.invoice_number || invoice.file_name || invoice.id}?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: invoice.id, filePath: invoice.file_path });
      toast({ title: 'Invoice deleted' });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  // Summaries
  const unpaidTotal = invoices
    .filter(i => i.status === 'unpaid' || isOverdue(i))
    .reduce((sum, i) => sum + (i.amount || 0), 0);
  const paidTotal = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + (i.amount || 0), 0);
  const overdueCount = invoices.filter(i => isOverdue(i)).length;

  return (
    <div>
      {/* Summary strip */}
      <div className="flex items-center gap-6 mb-4 text-sm">
        <div className="flex items-center gap-1.5">
          <DollarSign size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground">Outstanding:</span>
          <span className="font-semibold">{formatCurrencyAmount(unpaidTotal, 'USD')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-success" />
          <span className="text-muted-foreground">Collected:</span>
          <span className="font-semibold text-success">{formatCurrencyAmount(paidTotal, 'USD')}</span>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-destructive" />
            <span className="font-semibold text-destructive">{overdueCount} overdue</span>
          </div>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus size={14} className="mr-1" /> New Invoice
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="data-card mb-4 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New Invoice</h4>
          <div className="grid grid-cols-4 gap-3">
            <Input
              value={formData.invoiceNumber}
              onChange={e => setFormData({ ...formData, invoiceNumber: e.target.value })}
              placeholder="Invoice # (optional)"
            />
            <Input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              placeholder="Amount"
            />
            <Input
              type="date"
              value={formData.invoiceDate}
              onChange={e => setFormData({ ...formData, invoiceDate: e.target.value })}
            />
            <Input
              type="date"
              value={formData.dueDate}
              onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
              placeholder="Due date"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {closedWonOpps.length > 0 && (
              <select
                value={formData.opportunityId}
                onChange={e => setFormData({ ...formData, opportunityId: e.target.value })}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
              >
                <option value="">Link to deal (optional)</option>
                {closedWonOpps.map((o: any) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            )}
            <Input
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes (optional)"
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={e => setPendingFile(e.target.files?.[0] || null)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload size={12} className="mr-1" />
                {pendingFile ? pendingFile.name.slice(0, 20) : 'Attach file'}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
            <Button type="submit" size="sm" disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Creating...' : 'Create Invoice'}
            </Button>
          </div>
        </form>
      )}

      {/* Invoice list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No invoices yet</p>
      ) : (
        <div className="data-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Invoice</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Due</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Deal</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const overdue = isOverdue(inv);
                const effectiveStatus = overdue && inv.status === 'unpaid' ? 'overdue' : inv.status;
                const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.unpaid;
                const StatusIcon = cfg.icon;
                return (
                  <tr key={inv.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Receipt size={14} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{inv.invoice_number || inv.file_name || 'Invoice'}</p>
                          {inv.file_name && inv.invoice_number && (
                            <p className="text-[10px] text-muted-foreground truncate">{inv.file_name} · {formatFileSize(inv.file_size)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{formatCurrencyAmount(inv.amount, inv.currency)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.invoice_date}</td>
                    <td className="px-4 py-3">
                      {inv.due_date ? (
                        <span className={overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                          {inv.due_date}
                          {overdue && <span className="text-[10px] ml-1">({daysOverdue(inv)}d late)</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                        <StatusIcon size={9} /> {cfg.label}
                      </span>
                      {inv.paid_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(inv.paid_at).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {inv.opportunities ? (
                        <span className="flex items-center gap-0.5"><Link2 size={9} /> {inv.opportunities.name}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {inv.status !== 'paid' && inv.status !== 'void' && (
                          <button
                            onClick={() => handleMarkPaid(inv)}
                            disabled={markPaidMutation.isPending}
                            className="p-1.5 rounded hover:bg-success/10 text-muted-foreground hover:text-success"
                            title="Mark as paid"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        {inv.file_path && (
                          <button
                            onClick={() => handleDownload(inv)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Download"
                          >
                            <Download size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(inv)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
