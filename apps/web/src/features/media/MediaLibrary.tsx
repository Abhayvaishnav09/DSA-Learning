'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { platform } from '@logicpath/contracts';
import {
  Button,
  Callout,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  PageHeader,
  toast,
} from '@logicpath/ui';
import { Copy, ImageIcon, Trash2, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useStrings } from '@/shared/i18n/useT';
import { QueryView } from '@/shared/ui/QueryView';
import { studioStrings } from '../studio/strings';

/** The picture library: upload with a description, see everything, copy an id, delete. */
export function MediaLibrary() {
  const t = useStrings(studioStrings).media;
  const list = useApi('studio.media.list', { query: { limit: 100 } });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.intro} />
      <UploadForm />
      <QueryView query={list}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState icon={<ImageIcon />} title={t.empty} />
          ) : (
            <ul
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="media-grid"
            >
              {data.items.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

function UploadForm() {
  const t = useStrings(studioStrings).media;
  // A new key empties the file chooser after an upload.
  const [round, setRound] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const upload = useApiMutation('studio.media.upload', {
    invalidates: ['studio.media.list'],
    onSuccess: () => {
      toast.success(t.uploaded);
      setFile(null);
      setAlt('');
      setRound((n) => n + 1);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('alt', alt);
    upload.mutate({ body: form });
  };
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4 md:flex-row md:items-end">
        {upload.error && !upload.error.problem.errors?.length && (
          <Callout tone="danger" className="md:hidden">
            {upload.error.message}
          </Callout>
        )}
        <Field label={t.file} description={t.fileHelp} className="md:w-72">
          <Input
            key={round}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="h-auto py-2"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="media-file"
          />
        </Field>
        <Field
          label={t.alt}
          description={t.altHelp}
          error={upload.error?.fieldErrors().alt}
          className="flex-1"
        >
          <Input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={200}
            data-testid="media-alt"
          />
        </Field>
        <Button
          type="submit"
          leftIcon={<Upload />}
          loading={upload.isPending}
          disabled={!file || alt.trim().length < 3}
          data-testid="media-upload"
        >
          {t.upload}
        </Button>
      </form>
      {upload.error && !upload.error.problem.errors?.length && (
        <Callout tone="danger" className="mt-3 hidden md:block">
          {upload.error.message}
        </Callout>
      )}
    </Card>
  );
}

function AssetCard({ asset }: { asset: platform.MediaAsset }) {
  const t = useStrings(studioStrings).media;
  const [confirming, setConfirming] = useState(false);
  const remove = useApiMutation('studio.media.delete', {
    invalidates: ['studio.media.list'],
    onSuccess: () => {
      setConfirming(false);
      toast.success(t.deleted);
    },
  });
  return (
    <li>
      <Card padding="none" className="overflow-hidden" data-testid="media-card">
        <div
          className="aspect-[4/3] w-full bg-surface-2 bg-cover bg-center"
          style={{ backgroundImage: `url(${asset.blurDataUrl})` }}
        >
          {/* A plain img: the picture is already resized, and a blur placeholder sits behind it. */}
          <img
            src={asset.urls.w640}
            alt={asset.alt}
            loading="lazy"
            width={asset.width}
            height={asset.height}
            className="size-full object-contain"
          />
        </div>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-sm font-medium">{asset.alt}</p>
          <p className="truncate text-xs text-muted">
            {asset.filename} · {t.dimensions(asset.width, asset.height)} ·{' '}
            {t.size(Math.max(1, Math.round(asset.bytes / 1024)))}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Copy />}
              onClick={() => {
                void navigator.clipboard?.writeText(asset.id).catch(() => {});
                toast.success(t.copyId);
              }}
            >
              {t.copyId}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Trash2 />}
              onClick={() => setConfirming(true)}
            >
              {t.delete}
            </Button>
          </div>
        </div>
      </Card>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title={t.deleteTitle} description={t.deleteBody}>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              ×
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate({ params: { id: asset.id } })}
            >
              {t.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
