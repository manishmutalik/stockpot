import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Camera, Check, Copy, Download, ImagePlus, Loader2, Megaphone, RefreshCw, Share2, Sparkles } from 'lucide-react';
import { AiBlockedNote } from '../components/AiBlockedNote';
import { cropToShape, type Promoter } from '../hooks/usePromote';
import { postText, PROMOTE_LABEL, PROMOTE_LANGUAGES, PROMOTE_SHAPES, shapeOf, type PromoteLanguage, type PromoteResult, type PromoteShapeId } from '../utils/promote';
import { saveFile, shareFileViaSystem } from '../utils/shareFile';

interface PromoteViewProps {
  promoter: Promoter | null;
  /** Why AI is not available, when the owner can do something about it. */
  aiBlocked: string | null;
  businessName: string;
}

type Stage = { kind: 'pick' } | { kind: 'working' } | { kind: 'failed'; message: string } | { kind: 'done'; result: PromoteResult };

const chip = (on: boolean) =>
  `px-3 h-9 rounded-lg text-sm font-semibold border transition-colors ${on ? 'bg-primary text-white border-primary' : 'bg-white text-ink border-stone-200 hover:bg-stone-50'}`;
const actionCls = 'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50';

/** Promote: a photo of a dish, made ready to post, with a caption and hashtags to go with it. */
export const PromoteView: React.FC<PromoteViewProps> = ({ promoter, aiBlocked, businessName }) => {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [language, setLanguage] = useState<PromoteLanguage>('en');
  const [file, setFile] = useState<File | null>(null);
  const [shape, setShape] = useState<PromoteShapeId>('post');
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<{ tag: string; on: boolean }[]>([]);
  const [withOrder, setWithOrder] = useState(true);
  const [showBefore, setShowBefore] = useState(false);
  const [cropped, setCropped] = useState<{ file: File; url: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const originalUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);

  const result = stage.kind === 'done' ? stage.result : null;
  // The photo cut to the chosen shape, made again whenever the shape or the photo changes.
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    let url: string | null = null;
    cropToShape(result.image, shapeOf(shape), result.reading.focus, `promote-${shape}.jpg`)
      .then(f => {
        if (cancelled) return;
        url = URL.createObjectURL(f);
        setCropped({ file: f, url });
      })
      .catch(() => { if (!cancelled) setCropped(null); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [result, shape]);

  const run = async (photo: File) => {
    if (!promoter) return;
    setStage({ kind: 'working' });
    setNote(null);
    setShowBefore(false);
    const outcome = await promoter.promote(photo, language);
    if (outcome.ok === false) { setStage({ kind: 'failed', message: outcome.message }); return; }
    setCaption(outcome.result.reading.caption);
    setTags(outcome.result.reading.hashtags.map(tag => ({ tag, on: true })));
    setStage({ kind: 'done', result: outcome.result });
  };

  const choose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setFile(picked);
    void run(picked);
  };

  const startAgain = () => { setStage({ kind: 'pick' }); setFile(null); setCropped(null); setNote(null); };

  const text = result ? postText(caption, tags.filter(t => t.on).map(t => t.tag), withOrder ? result.orderLine : null) : '';
  const copyText = async (): Promise<boolean> => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  };
  const share = async () => {
    if (!cropped) return;
    const copied = await copyText();
    const shared = await shareFileViaSystem(cropped.file, text);
    if (shared === 'unsupported') {
      saveFile(cropped.file);
      setNote(copied ? 'Photo saved and caption copied. Open Instagram, choose the photo and paste the caption.' : 'Photo saved. Copy the caption below and paste it in Instagram.');
    } else if (shared === 'shared') {
      setNote(copied ? 'Caption copied too: Instagram leaves it out, so paste it there.' : null);
    }
  };
  const download = async () => {
    if (!cropped) return;
    saveFile(cropped.file);
    const copied = await copyText();
    setNote(copied ? 'Photo saved and caption copied.' : 'Photo saved.');
  };
  const copy = async () => setNote((await copyText()) ? 'Caption copied.' : 'Could not copy here: select the caption and copy it.');

  const shapeInfo = shapeOf(shape);
  const remaining = promoter?.remaining;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
          <span className="truncate">{businessName || 'My Bakery'}</span>
          <span className="text-stone-300">/</span>
          <span className="text-primary font-semibold whitespace-nowrap">Social media</span>
        </div>
        <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">{PROMOTE_LABEL}</h2>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Take or choose a photo of something you make. It comes back brighter and cropped for Instagram, with a caption and hashtags ready to post.
        </p>
      </div>

      {!promoter && (
        <AiBlockedNote title={PROMOTE_LABEL} message={aiBlocked ?? `${PROMOTE_LABEL} uses AI, which is not switched on for this account.`} />
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={choose} />
      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={choose} />

      {promoter && (stage.kind === 'pick' || stage.kind === 'failed') && (
        <div className="surface-card p-5 md:p-6 space-y-5 max-w-2xl">
          {stage.kind === 'failed' && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-coral/10 text-coral p-3 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{stage.message}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => cameraInput.current?.click()} className={`${actionCls} bg-primary text-white hover:bg-primary/90 h-14`}>
              <Camera size={20} /> Take a photo
            </button>
            <button onClick={() => galleryInput.current?.click()} className={`${actionCls} bg-stone-100 text-ink hover:bg-stone-200 h-14`}>
              <ImagePlus size={20} /> Choose a photo
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted mr-1">Caption in</span>
            {PROMOTE_LANGUAGES.map(l => (
              <button key={l.value} onClick={() => setLanguage(l.value)} aria-pressed={language === l.value} className={chip(language === l.value)}>{l.label}</button>
            ))}
          </div>
          <p className="text-xs text-muted">
            The food stays exactly as you made it: only the light, colour and framing are improved. Photos are not kept.
            {typeof remaining === 'number' && <> {remaining === 0 ? ' No more photos today: try again tomorrow.' : ` ${remaining} left today.`}</>}
          </p>
          {file && stage.kind === 'failed' && (
            <button onClick={() => void run(file)} className={`${actionCls} bg-stone-100 text-ink hover:bg-stone-200`}>
              <RefreshCw size={16} /> Try this photo again
            </button>
          )}
        </div>
      )}

      {promoter && stage.kind === 'working' && (
        <div className="surface-card p-5 md:p-6 max-w-2xl space-y-4" aria-busy="true">
          {originalUrl && <img src={originalUrl} alt="" className="w-full max-h-[420px] object-contain rounded-xl opacity-60" />}
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Loader2 size={18} className="animate-spin text-primary" /> Making it look its best and writing a caption…
          </p>
        </div>
      )}

      {promoter && result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="surface-card p-4 space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Shape">
              {PROMOTE_SHAPES.map(s => (
                <button key={s.id} onClick={() => setShape(s.id)} aria-pressed={shape === s.id} className={chip(shape === s.id)}>
                  {s.label} <span className="font-mono text-[11px] opacity-70">{s.hint}</span>
                </button>
              ))}
            </div>
            <div className="relative mx-auto w-full max-w-md bg-stone-100 rounded-xl overflow-hidden" style={{ aspectRatio: `${shapeInfo.width} / ${shapeInfo.height}` }}>
              {showBefore && originalUrl
                ? <img src={originalUrl} alt="Your photo as taken" className="absolute inset-0 w-full h-full object-contain" />
                : cropped
                  ? <img src={cropped.url} alt={`Your photo, improved, as a ${shapeInfo.label.toLowerCase()}`} className="absolute inset-0 w-full h-full object-cover" />
                  : <Loader2 size={24} className="absolute inset-0 m-auto animate-spin text-muted" />}
              {originalUrl && (
                <button
                  onClick={() => setShowBefore(b => !b)}
                  aria-pressed={showBefore}
                  className="absolute top-2 right-2 px-3 h-8 rounded-lg bg-black/60 text-white text-xs font-semibold backdrop-blur"
                >
                  {showBefore ? 'After' : 'Before'}
                </button>
              )}
            </div>
          </div>

          <div className="surface-card p-4 md:p-5 space-y-4">
            {!result.reading.isFood && (
              <div role="note" className="flex items-start gap-2 rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <span>This does not look like food. Check the caption before you post it.</span>
              </div>
            )}
            {result.reading.dishName && (
              <p className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted">
                <Sparkles size={12} /> {result.reading.dishName}
              </p>
            )}
            <label className="block">
              <span className="block text-sm font-semibold text-ink mb-1.5">Caption</span>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={5}
                className="w-full rounded-xl bg-stone-50 border border-stone-200 p-3 text-sm text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </label>
            <div>
              <span className="block text-sm font-semibold text-ink mb-1.5">Hashtags <span className="font-normal text-muted">(tap to leave one out)</span></span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, i) => (
                  <button
                    key={t.tag}
                    onClick={() => setTags(ts => ts.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                    aria-pressed={t.on}
                    className={`px-2.5 h-8 rounded-full text-xs font-semibold border transition-colors ${t.on ? 'bg-primary/10 text-primary border-primary/20' : 'bg-white text-stone-400 border-stone-200 line-through'}`}
                  >
                    {t.tag}
                  </button>
                ))}
              </div>
            </div>
            {result.orderLine ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={withOrder} onChange={e => setWithOrder(e.target.checked)} className="w-4 h-4 accent-primary" />
                Add “{result.orderLine}”
              </label>
            ) : (
              <p className="text-xs text-muted">Add your phone number in Settings › Business Profile to tell customers how to order.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button onClick={() => void share()} disabled={!cropped} className={`${actionCls} bg-primary text-white hover:bg-primary/90`}>
                <Share2 size={16} /> Share
              </button>
              <button onClick={() => void download()} disabled={!cropped} className={`${actionCls} bg-stone-100 text-ink hover:bg-stone-200`}>
                <Download size={16} /> Save photo
              </button>
              <button onClick={() => void copy()} className={`${actionCls} bg-stone-100 text-ink hover:bg-stone-200`}>
                <Copy size={16} /> Copy caption
              </button>
            </div>
            {note && <p role="status" className="flex items-start gap-1.5 text-sm text-primary"><Check size={16} className="shrink-0 mt-0.5" /> {note}</p>}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => file && void run(file)}
                disabled={!file || remaining === 0}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                <RefreshCw size={15} /> Write another caption
              </button>
              <button onClick={startAgain} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold text-muted hover:bg-stone-100">
                <Megaphone size={15} /> New photo
              </button>
            </div>
            {typeof remaining === 'number' && <p className="text-xs text-muted">{remaining} left today. Each new caption uses one.</p>}
          </div>
        </div>
      )}
    </motion.div>
  );
};
