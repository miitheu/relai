import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { useCampaign, useDeleteCampaign } from '@/hooks/useCampaigns';
import { useDatasets } from '@/hooks/useCrmData';
import LoadingState from '@/components/LoadingState';
import CampaignWorkspace from '@/components/campaigns/CampaignWorkspace';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campaign, isLoading } = useCampaign(id);
  const { data: datasets = [] } = useDatasets();
  const deleteCampaign = useDeleteCampaign();

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteCampaign.mutateAsync(id);
      toast.success('Campaign deleted');
      navigate('/campaigns');
    } catch {
      toast.error('Failed to delete campaign');
    }
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;
  if (!campaign) return <AppLayout><div className="text-center text-muted-foreground py-20">Campaign not found</div></AppLayout>;

  return (
    <AppLayout>
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors">Home</button>
        <span>/</span>
        <button onClick={() => navigate('/campaigns')} className="hover:text-foreground transition-colors">Campaigns</button>
        <span>/</span>
        <span className="text-foreground font-medium truncate max-w-[200px]">{campaign.name}</span>
      </nav>
      <CampaignWorkspace campaign={campaign} datasets={datasets} onDelete={handleDelete} />
    </AppLayout>
  );
}
